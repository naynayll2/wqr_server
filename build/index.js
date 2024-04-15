"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongodb_1 = require("mongodb");
const bson_1 = require("bson");
const app = (0, express_1.default)();
const port = process.env.PORT;
const URI = process.env.MONGO_URI;
const DB = process.env.DB;
const COLLECTION = process.env.COLLECTION;
const client = new mongodb_1.MongoClient(URI, {
    pkFactory: { createPk: () => new bson_1.UUID().toBinary() }
});
const wqrCollection = client.db(DB).collection(COLLECTION);
function batchAddToWQR(timeseries) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = yield wqrCollection.insertMany(timeseries);
        return new Promise((resolve, reject) => {
            try {
                console.log("Inserting into database");
                console.log(results);
                if (results.acknowledged && results.insertedCount === timeseries.length) {
                    console.log("Submitted succesfully");
                    resolve(true);
                }
                else {
                    console.log(`Failure in submission: Acknowledged=${results.acknowledged}` +
                        `given=${timeseries.length} submitted=${timeseries.length}`);
                    resolve(false);
                }
            }
            catch (_a) {
                resolve(false);
            }
        });
    });
}
app.use(express_1.default.json());
app.post("/api/data/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(req.body);
    if (req.body["robotID"] === undefined) {
        res.status(400).send("Must have 'robotID' set");
    }
    else {
        let size = undefined;
        for (let [key, value] of Object.entries(req.body)) {
            if (key === "robotID") {
                continue;
            }
            else if (value instanceof Array) {
                if (size === undefined) {
                    size = value.length;
                }
                else if (size !== value.length) {
                    res.status(400).send("All arrays must have the same length");
                    return;
                }
            }
            else {
                res.status(400).send("Every non-'robotID' key must have an Array value");
                return;
            }
        }
        const timeseries = [];
        for (let i = 0; i < size; i++) {
            let tempEntry = {};
            for (let [key, value] of Object.entries(req.body)) {
                let curVal = value[i];
                if (key === "robotID") {
                    curVal = value;
                }
                if (key === "timestamp") {
                    value = new bson_1.Timestamp(BigInt(curVal));
                }
                tempEntry[key] = curVal;
            }
            timeseries.push(tempEntry);
        }
        console.log(timeseries);
        const status = yield batchAddToWQR(timeseries);
        if (status) {
            console.log("Done now");
            res.status(200).send("OK");
        }
    }
}));
app.get("/api/data/", (req, res) => {
});
app.listen(port, () => {
    console.log(`Active on ${port} ${DB} ${COLLECTION}`);
});
