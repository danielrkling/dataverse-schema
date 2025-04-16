import { primaryKey, table, postRecord, postRecordGetId, query, getRecords, $select, string, expand, collection } from "./dist/dataverse-schema.js";

const Kid = table("systemusers",{
    name: string("c220a")
})

const User = table("systemusers",{
    userId: primaryKey("systemuserid"),
    name: string("c220a"),
    oldest: expand("", Kid),
    kids: collection("", Kid)
})

getRecords("test",query({$select:$select(s)}))


User.dissociateRecord("oldest","","1")