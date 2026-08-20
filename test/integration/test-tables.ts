const client = new DataverseClient()

export const CodeTable = new DataverseTable({
    client,
    logicalName: "c200_code",
    entitySetName: "c200_codes",
    fields: { primaryKey: primaryKey("c200_codeid"), name: string("c200_code") }
})

export const UserTable = new DataverseTable({
    client,
    logicalName: "systemuser",
    entitySetName: "systemusers",
    fields: {
        userId: primaryKey("systemuserid"),
        fullName: string("fullname"),
        firstName: string("firstname"),
        lastName: string("lastname"),
        badgeNumber: string("c200_badgenumber"),
        email: string("internalemailaddress"),
        code: lookupId("c200_Code", () => CodeTable),
        createdon: datetime("createdon")
    }
})

const TestTable = new DataverseTable({
    logicalName: "nnsyc200_test_table",
    entitySetName: "nnsyc200_test_tables",
    client,
    fields: {
        id: primaryKey("nnsyc200_test_tableid"),
        bool: boolean("nnsyc200_boolean"),
        modifiedOn: datetime("modifiedon"),
        user: lookupId("nnsyc200_User", () => UserTable),
        datetime: datetime("nnsyc200_datetime"),
        dateOnly: date("nnsyc200_dateonly"),
        stateCode: number("statecode"),
        int: number("nnsyc200_int"),
        versionNumber: number("versionnumber"),
        file: file("nnsyc200_file"),
        formula: string("nnsyc200_formula"),
        date: datetime("nnsyc200_date"),
        createdOn: datetime("createdon"),
        text: string("nnsyc200_text"),
        statusCode: number("statuscode"),
        image: image("nnsyc200_image"), 
        name: string("nnsyc200_name")
    }
})
