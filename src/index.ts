import express, {Express, Request, Response} from "express"
import { MongoClient, Timestamp, Document, Sort, SortDirection } from "mongodb"
import { UUID } from "bson"

const app = express()
const port = process.env.PORT!!
const URI = process.env.MONGO_URI!!
const DB = process.env.DB!!
const COLLECTION = process.env.COLLECTION!!
const LAKE_COLLECTION = process.env.LAKE_NAME_COLLECTION!!

const client = new MongoClient(URI, {
  pkFactory:{createPk: () => new UUID().toBinary()}
})

const db = client.db(DB)
db.createCollection(COLLECTION, {
  timeseries: {
    timeField: 'timestamp',
    metaField: 'robotID'
  }
}).catch((r) => {
  console.log(`Failed with error ${r}`)
})

const wqrCollection = db.collection(COLLECTION)
const lakeNameCollection = db.collection(LAKE_COLLECTION)
const indexResult = await lakeNameCollection.createIndex({robotID: 1})

async function batchAddToWQR(timeseries: Array<{[key: string]: any}>): Promise<boolean> {
  console.log("Inserting into database")
  return wqrCollection.insertMany(timeseries).then((results) => {
    if (results.acknowledged && results.insertedCount === timeseries.length) {
      console.log("Submitted succesfully")
    }
    return true
  }, (error) => {
    console.log(error)
    return false
  })
}

app.use(express.json())

app.post("/api/data/", async (req: Request, res: Response) => {
  console.log(req.body)

  if (req.body["robotID"] === undefined) {
    res.status(400).send("Must have 'robotID' set")
  } else {
    let size: number | undefined = undefined
    const lakeData = await lakeNameCollection.find({
      robotID: {
        $eq: req.body.robotID 
      }
    }).toArray()

    if (lakeData.length === 0 || lakeData[0].robotID === undefined) {
      res.status(400).send("Cannot find lake associated with robotID. Send PUT mapping robotID to lakeName")
      return
    }

    const lakeName = lakeData[0].lakeName as string

    for (let [key, value] of Object.entries(req.body)) {
      if (key === "robotID") {
        continue
      } else if (value instanceof Array) {
        if (size === undefined) {
          size = value.length
        } else if (size !== value.length) {
          res.status(400).send("All arrays must have the same length")
          return
        }
      } else {
        res.status(400).send("Every non-'robotID' key must have an Array value")
        return
      }
    }

    const timeseries: Array<{[key: string]: any}> = []

    for (let i = 0; i < size!!; i++) {
      let tempEntry: {[key: string]: any} = { lakeName: lakeName}
      for (let [key, value] of Object.entries(req.body)) {
          let curVal = (value as Array<string|number>|String)[i]
          if (key === "timestamp") {
            tempEntry[key] = new Date(Number(curVal) * 1000)
          } else if (key === "robotID") {
            tempEntry["metadata"] = { 'robotID' : value }
          } else {
            tempEntry[key] = curVal
          }
      }
      timeseries.push(tempEntry)
    }
    console.log(timeseries)
    const status = await batchAddToWQR(timeseries)
    if (status) {
      console.log("Done now")
      res.status(200).send("OK")
    } else {
      res.status(400).send("Server Error")
    }
  }
})

app.get("/api/data/", async (req: Request, res: Response) => {
  if (req.body.operation === "GetAllLakeNames") {
    const names = await lakeNameCollection.distinct("lakeName")
    res.status(200).send(names)
  } else if (req.body.operation === "GetAllLakeData") {
    const pipeline = [
      {
        $sort: {timestamp: -1}
      }, 
      {
        $group: {
          _id: '$metadata.robotID',
          latestDocument: {
            $first: '$$ROOT'
          }
        }
      }
    ]

    const keysToFilter = ['_id', 'metadata']
    const results = await wqrCollection.aggregate(pipeline).toArray()

    const newResults = new Array<Document>()

    for (const doc of results) {
      await lakeNameCollection.findOne({robotID: { $eq: doc._id}}).then((lakeData) => {
        newResults.push({
          robotID: doc._id,
          lakeName: lakeData?.lakeName,
          ...Object.fromEntries(Object.entries(doc.latestDocument).filter(
            ([k,v]) => !(keysToFilter.includes(k))
          ))
        })
      })
    }
    res.status(200).send(newResults)
  } else if (req.body.operation === "GetLakeHistory") {
    console.log(req.body)
    const startTime = req.body.startTime
    const endTime = req.body.endTime

    if (startTime === undefined || endTime === undefined) {
      res.status(400).send("JSON body must have 'startTime' and 'endTime' set to valid ISO timestamps")
    } else {
      const lakeData = await lakeNameCollection.findOne({lakeName: { $eq: req.body.lakeName}})
      const query = {
        metadata: {robotID: lakeData?.robotID},
        timestamp: {
          $gte: new Date(startTime), 
          $lte: new Date(endTime)
        }
      }
      
      if (lakeData === undefined) {
        res.status(400).send("Cannot find lake associated with robotID. Send PUT mapping robotID to lakeName")
        return
      }
      const sort = { timestamp: 'desc' as SortDirection}

      const results = await wqrCollection.find(query).sort(sort).toArray()
      const finalResults = results.reduce((arr: Array<Document>, doc): Array<Document> => {
        const newObj = Object.keys(doc).filter(key => key !== '_id').reduce((obj: Document, key: string): Document => {
          if (key != 'metadata') {
            obj[key] = doc[key]
          } else {
            obj['robotID'] = doc.metadata.robotID
          }
          obj.lakeName = lakeData?.lakeName
          return obj
        }, {})
        arr.push(newObj)
        return arr
      }, new Array<Document>())
      console.log(finalResults)
      res.status(200).send(finalResults)
    }
  } else {// No defined API, reject
    res.status(400).send("Wrong server operation")
  }
})
// TODO add check to make sure no duplicates
app.put("/api/data/", async (req: Request, res: Response) => {
  if (req.body.robotID === undefined) {
    res.status(400).send("robotID needs to be defined")
  } else {
    console.log(`Putting in lake ${req.body.lakeName}`)
    const update = {
      $set: {
        robotID: req.body.robotID,
        lakeName: req.body.lakeName
      }
    }
    const options = { upsert: true }
    lakeNameCollection.updateOne({robotID: { $eq: req.body.robotID}}, update, options)
    res.status(200).send()
  }
})

app.listen(port, () => {
  console.log(`Active on ${port} ${DB} ${COLLECTION}`)
})