import express, {Express, Request, Response} from "express"
import { MongoClient, Timestamp, Document } from "mongodb"
import { UUID } from "bson"
import { start } from "repl"

const app = express()
const port = process.env.PORT!!
const URI = process.env.MONGO_URI!!
const DB = process.env.DB!!
const COLLECTION = process.env.COLLECTION!!

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
      let tempEntry: {[key: string]: any} = {}
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
    const names = await wqrCollection.distinct("robotID")
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
    let results = await wqrCollection.aggregate(pipeline).toArray()

    results = results.reduce((accum: Array<Document>, currentValue: Document): Array<Document> => {
      accum.push({
        robotID: currentValue._id,
        ...Object.fromEntries(Object.entries(currentValue.latestDocument).filter(
          ([k,v]) => !(keysToFilter.includes(k))
        ))
      })
      return accum
    }, new Array<Document>())
    
    console.log(results)
    res.status(200).send(results)
  } else if (req.body.operation === "GetAllLakeHistory") {
    const startTime = req.body.startTime
    const endTime = req.body.endTime

    if (startTime === undefined || endTime === undefined) {
      res.status(400).send("JSON body must have 'startTime' and 'endTime' set to valid ISO timestamps")
    }
  } else {// No defined API, reject
  }
})

app.listen(port, () => {
  console.log(`Active on ${port} ${DB} ${COLLECTION}`)
})