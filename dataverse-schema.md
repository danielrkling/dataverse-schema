# Dataverse-Schema Issues

## Table
1. Logical name and Entitysetname
```ts
new DataverseTable({
    client:,
    entitySetName:,
    logicalName:,
    columns:{

    },
    relationships:{

    },
    keys:{

    }
})

new DataverseIntersectTable(name,table1,table2)
```

## Odata Query
1. Select should default to the defined columns on the table, not blank
2. No point in `includeCount`, once we get the json array we can get length anyway. and count isnt accurate if greater than 5000
3. Any/all are only needed for collection props. not lookups
4. Query options inside expands should be joined by ";"
5. Orderby should collect and api should be `orderby(v=>v.title,"asc")` where "asc" is default
6. We dont need expand ref
7. groupby should be its own method `groupby(v=>[v.title],v=>({count: count(),avg: avg(v.title)}))`


## Fetch XML query
1. Default select should be all listed columns
2. Deeply nested joins not working
3. Accept plain string
```ts

```


## Add fetchSql
