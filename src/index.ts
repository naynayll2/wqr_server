import express, {Express, Request, Response} from "express"
import { MongoClient } from "mongodb"
import { UUID, Timestamp } from "bson"

const app = express()
const port = process.env.PORT!!
const URI = process.env.MONGO_URI!!
const DB = process.env.DB!!
const COLLECTION = process.env.COLLECTION!!

const client = new MongoClient(URI, {
  pkFactory:{createPk: () => new UUID().toBinary()}
})

const db = client.db(DB)

db.createCollection('wqr', {
  timeseries: {
    timeField: 'timestamp',
    metaField: 'robotID'
  }
}).catch((r) => {
  console.log(`Failed with error ${r}`)
})

const wqrCollection = db.collection('wqr')

async function batchAddToWQR(timeseries: Array<{[key: string]: any}>): Promise<boolean> {
  const results = await wqrCollection.insertMany(timeseries)
  return new Promise((resolve, reject) => {
    try{
      console.log("Inserting into database")
      console.log(results)
      if (results.acknowledged && results.insertedCount === timeseries.length) {
        console.log("Submitted succesfully")
        resolve(true)
      } else {
        console.log(`Failure in submission: Acknowledged=${results.acknowledged}` +
          `given=${timeseries.length} submitted=${timeseries.length}`)
        resolve(false)
      }
    } catch {
      resolve(false)
    }
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
          if (key === "robotID") {
            curVal = value as string
          }
          if (key === "timestamp") {
            value = new Timestamp(BigInt(curVal))
          }
          tempEntry[key] = curVal
      }
      timeseries.push(tempEntry)
    }
    console.log(timeseries)
    const status = await batchAddToWQR(timeseries)
    if (status) {
      console.log("Done now")
      res.status(200).send("OK")
    }
  }
})

app.get("/api/data/", async (req: Request, res: Response) => {
  if (req.body.operation === "GetAllLakeNames") {
    const names = await wqrCollection.distinct("robotID")
    res.status(200).send(names)
  } else if (req.body.operation === "GetAllLakeData") {
    const startTime = req.body.startTime
    const endTime = req.body.endTime

    
  } else if (req.body.operation === "GetAllLakeHistory") {

  } else {// No defined API, reject

  }
})

app.listen(port, () => {
  console.log(`Active on ${port} ${DB} ${COLLECTION}`)
})