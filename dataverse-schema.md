# Dataverse-Schema Issues

## General Issues

## Odata Query Bugs
1. When using grouby. $select, $orderby, and $expand need to be excluded from queryString. they are not supported. We should also hide those from the builder following groupby. grouby should also be hidden since we cant have 2 groupbys.
2. When using select, it should not be transforming the other columns/setting to default since those are not defined in the querystring. it should only transform the selected columns
3. etag is undefined in final transform
4. in filter expresions like isNull() it should accept the parent level lookups. Code works just needs typescript fix
5. any started at "x"
6. expand 2nd param should be optional and default to the plain table/default query
7. collection level expands should only show select, orderby, where, top and expand for single lookup values.
8. Single level expands should only show select and expand and filter

## Fetch XML bugs
1. Auto-alias counter not working, getting duplicate
2. entityname prop on filters should only exist on top level.
3. no select is still pulling all attributes.
4. no etag
6. no need for all-attributes
8. if a fieldref is passed to value of filterfn, it should use valueof
9. If possible type checking on filter operators that ony accept certain types like date
11. move datasource, latematerialize, aggregationlimit,useraworderbya and options to an optinal parameter in execute since they should be rarely used
12. We dont need returntotalrecordcount or paging
15. fetchXML doesnt return a key with a value when value is null or empty join. the transform should use the field default when the key doesnt exists.
16. any, all, not any, not all, exists and in, joins should only return a builder with "where". no attibutes should be built from them


proposed grouby/aggregation api. 
all fields must either be groupby or aggregate or it throws
```ts
fetchXml(User).select(v=>({
    name: groupby(v.fullname),
    count: count(),
    createdMonth: groupbyDate(c.createdon,"month")
}).join("inner",Table,"id","id",q=>q.select(v=>({
    alias: countColumn(v.foo)
}))))
```
