# Manual Review Output

Generated from `test/manual-review.test.ts` — 136 tests.

---

## OData SELECT

### OData select: single field

```typescript
fetchOdata(Account).select("name").toString()
```

```
$select=log_name
```

### OData select: multiple fields

```typescript
fetchOdata(Account).select("name", "revenue").toString()
```

```
$select=log_name,log_revenue
```

### OData select: all fields

```typescript
fetchOdata(Account).select().toString()
```

```
$select=log_id,log_name,log_revenue,log_city
```

### OData select: all fields on Contact (with lookups)

```typescript
fetchOdata(Contact).select().toString()
```

```
$select=log_id,log_name,log_email,_log_account_value
```

### OData select: all fields on Order (with lookups)

```typescript
fetchOdata(Order).select().toString()
```

```
$select=log_id,log_total,log_orderdate,_log_contact_value
```

### OData select: reverse order

```typescript
fetchOdata(Account).select("revenue", "name").toString()
```

```
$select=log_revenue,log_name
```

### OData select: single lookup ID field

```typescript
fetchOdata(Contact).select("accountId").toString()
```

```
$select=_log_account_value
```

## OData SELECT + FILTER

### OData select + filter: eq

```typescript
fetchOdata(Account).select("name").filter(f => eq(f.city, "Seattle")).toString()
```

```
$select=log_name&$filter=(log_city eq 'Seattle')
```

### OData select + filter: ne

```typescript
fetchOdata(Account).select("name").filter(f => ne(f.city, "NYC")).toString()
```

```
$select=log_name&$filter=(log_city ne 'NYC')
```

### OData select + filter: gt

```typescript
fetchOdata(Account).select("name", "revenue").filter(f => gt(f.revenue, 1000)).toString()
```

```
$select=log_name,log_revenue&$filter=(log_revenue gt 1000)
```

### OData select + filter: ge

```typescript
fetchOdata(Account).select("name").filter(f => ge(f.revenue, 500)).toString()
```

```
$select=log_name&$filter=(log_revenue ge 500)
```

### OData select + filter: lt

```typescript
fetchOdata(Account).select("name").filter(f => lt(f.revenue, 2000)).toString()
```

```
$select=log_name&$filter=(log_revenue lt 2000)
```

### OData select + filter: le

```typescript
fetchOdata(Account).select("name").filter(f => le(f.revenue, 1000)).toString()
```

```
$select=log_name&$filter=(log_revenue le 1000)
```

### OData select + filter: contains

```typescript
fetchOdata(Account).select("name").filter(f => contains(f.name, "Corp")).toString()
```

```
$select=log_name&$filter=contains(log_name,'Corp')
```

### OData select + filter: startsWith

```typescript
fetchOdata(Account).select("name").filter(f => startsWith(f.name, "Acme")).toString()
```

```
$select=log_name&$filter=startswith(log_name,'Acme')
```

### OData select + filter: and

```typescript
fetchOdata(Account).select("name").filter(f => and(eq(f.city, "Seattle"), gt(f.revenue, 500))).toString()
```

```
$select=log_name&$filter=((log_city eq 'Seattle') and (log_revenue gt 500))
```

### OData select + filter: or

```typescript
fetchOdata(Account).select("name").filter(f => or(eq(f.city, "Seattle"), eq(f.city, "NYC"))).toString()
```

```
$select=log_name&$filter=((log_city eq 'Seattle') or (log_city eq 'NYC'))
```

### OData select + filter: and + or combined

```typescript
fetchOdata(Account).select("name").filter(f => and(or(eq(f.city, "Seattle"), eq(f.city, "NYC")), gt(f.revenue, 1000))).toString()
```

```
$select=log_name&$filter=(((log_city eq 'Seattle') or (log_city eq 'NYC')) and (log_revenue gt 1000))
```

### OData select + filter: multiple chained filters

```typescript
fetchOdata(Account).select("name").filter(f => eq(f.city, "Seattle")).filter(f => gt(f.revenue, 500)).toString()
```

```
$select=log_name&$filter=(log_city eq 'Seattle') and (log_revenue gt 500)
```

## OData ORDERBY + TOP

### OData select + orderby asc

```typescript
fetchOdata(Account).select("name").orderby(f => f.name).toString()
```

```
$select=log_name&$orderby=log_name asc
```

### OData select + orderby desc

```typescript
fetchOdata(Account).select("name", "revenue").orderby(f => f.revenue, "desc").toString()
```

```
$select=log_name,log_revenue&$orderby=log_revenue desc
```

### OData select + orderby multi

```typescript
fetchOdata(Account).select("name", "city").orderby(f => f.city).orderby(f => f.name, "desc").toString()
```

```
$select=log_name,log_city&$orderby=log_city asc,log_name desc
```

### OData select + top

```typescript
fetchOdata(Account).select("name", "revenue").top(5).toString()
```

```
$select=log_name,log_revenue&$top=5
```

### OData select + filter + orderby + top

```typescript
fetchOdata(Account).select("name", "revenue").filter(f => eq(f.city, "NYC")).orderby(f => f.name).top(10).toString()
```

```
$select=log_name,log_revenue&$filter=(log_city eq 'NYC')&$orderby=log_name asc&$top=10
```

## OData EXPAND (lookup)

### OData expand: bare lookup (no sub-select)

```typescript
fetchOdata(Contact).select("name").expand("account").toString()
```

```
$select=log_name&$expand=log_account()
```

### OData expand: lookup with select

```typescript
fetchOdata(Contact).select("name").expand("account", sub => sub.select("name", "city")).toString()
```

```
$select=log_name&$expand=log_account($select=log_name,log_city)
```

### OData expand: nested lookup → lookup (Order → Contact → Account)

```typescript
fetchOdata(Order).select("total").expand("contact", sub => sub.select("name").expand("account", sub2 => sub2.select("name", "city"))).toString()
```

```
$select=log_total&$expand=log_contact($select=log_name;$expand=log_account($select=log_name,log_city))
```

### OData expand: Contact → Account → (no collection on Account, use Contact expand)

```typescript
fetchOdata(Contact).select("name", "email").expand("account", sub => sub.select("name", "city")).toString()
```

```
$select=log_name,log_email&$expand=log_account($select=log_name,log_city)
```

## OData EXPAND (collection)

### OData expand: bare collection (no sub-select)

```typescript
fetchOdata(Ticket).select("title").expand("tags").toString()
```

```
$select=log_title&$expand=log_tags()
```

### OData expand: collection with select

```typescript
fetchOdata(Ticket).select("title").expand("tags", sub => sub.select("label")).toString()
```

```
$select=log_title&$expand=log_tags($select=log_label)
```

### OData expand: collection with select + filter

```typescript
fetchOdata(Ticket).select("title").expand("tags", sub => sub.select("label").filter(f => eq(f.label, "urgent"))).toString()
```

```
$select=log_title&$expand=log_tags($select=log_label;$filter=(log_label eq 'urgent'))
```

### OData expand: collection with select + orderby

```typescript
fetchOdata(Ticket).select("title").expand("tags", sub => sub.select("label").orderby(f => f.label)).toString()
```

```
$select=log_title&$expand=log_tags($select=log_label;$orderby=log_label asc)
```

### OData expand: collection with select + top

```typescript
fetchOdata(Ticket).select("title").expand("tags", sub => sub.select("label").top(5)).toString()
```

```
$select=log_title&$expand=log_tags($select=log_label;$top=5)
```

### OData expand: collection with select + filter + orderby + top

```typescript
fetchOdata(Ticket).select("title").expand("tags", sub => sub.select("label").filter(f => contains(f.label, "bug")).orderby(f => f.label).top(10)).toString()
```

```
$select=log_title&$expand=log_tags($select=log_label;$filter=contains(log_label,'bug');$orderby=log_label asc;$top=10)
```

## OData NESTED EXPAND

### OData nested expand: collection → lookup (Ticket → Tags → ?)

```typescript
Ticket.expand("tags", sub => sub.select("label")).expand("customer", sub2 => sub2.select("name", "region"))
```

```
$select=log_title&$expand=log_tags($select=log_label),log_customer($select=log_name,log_region)
```

### OData nested expand: lookup → collection (Ticket → Customer + Ticket → Tags)

```typescript
Ticket.select + expand customer (select) + expand tags (select + filter + orderby + top)
```

```
$select=log_title,log_priority&$expand=log_customer($select=log_name,log_region),log_tags($select=log_label;$filter=contains(log_label,'bug');$orderby=log_label asc;$top=5)
```

### OData nested expand: lookup → collection with full sub-query

```typescript
Ticket → customer (select + expand if had collection) + tags (select + filter + orderby + top)
```

```
$select=log_title&$expand=log_customer($select=log_name,log_region,log_level),log_tags($select=log_label;$filter=contains(log_label,'feature');$orderby=log_label asc;$top=3)
```

### OData nested expand: Contact → Account + Contact has no collection, but Order → Contact → Account works

```typescript
Order → contact (select + expand account (select))
```

```
$select=log_total,log_orderdate&$expand=log_contact($select=log_name,log_email;$expand=log_account($select=log_name,log_city,log_revenue))
```

### OData nested expand: Contact → Account with select + expand Account's name in Contact

```typescript
Contact.select("name").expand("account", sub => sub.select("name", "city"))
```

```
$select=log_name&$expand=log_account($select=log_name,log_city)
```

### OData nested expand: Order → Contact → Account, all with selects + filter at root

```typescript
Order.filter(gt(total,100)).select("total").expand("contact", sub => sub.select("name").expand("account", sub2 => sub2.select("name", "city")))
```

```
$select=log_total,log_orderdate&$filter=(log_total gt 100)&$expand=log_contact($select=log_name,log_email;$expand=log_account($select=log_name,log_city))
```

### OData expand: full complex (Contact + select + filter + orderby + top + expand account (select + expand + filter + orderby + top))

```typescript
Contact → account → tags, all with nested sub-queries
```

```
$select=log_name,log_email&$filter=contains(log_email,'example')&$orderby=log_name asc&$expand=log_account($select=log_name,log_city,log_revenue)&$top=20
```

## OData APPLY (aggregate)

### OData apply: count only

```typescript
fetchOdata(Account).apply(f => ({ total: count() })).toString()
```

```
$apply=aggregate($count as total)
```

### OData apply: count on specific field

```typescript
fetchOdata(Account).apply(f => ({ cityCount: count(f.city) })).toString()
```

```
$apply=aggregate(log_city with count as cityCount)
```

### OData apply: sum

```typescript
fetchOdata(Account).apply(f => ({ totalRevenue: sum(f.revenue) })).toString()
```

```
$apply=aggregate(log_revenue with sum as totalRevenue)
```

### OData apply: min

```typescript
fetchOdata(Account).apply(f => ({ minRevenue: min(f.revenue) })).toString()
```

```
$apply=aggregate(log_revenue with min as minRevenue)
```

### OData apply: max

```typescript
fetchOdata(Account).apply(f => ({ maxRevenue: max(f.revenue) })).toString()
```

```
$apply=aggregate(log_revenue with max as maxRevenue)
```

### OData apply: average

```typescript
fetchOdata(Account).apply(f => ({ avgRevenue: average(f.revenue) })).toString()
```

```
$apply=aggregate(log_revenue with average as avgRevenue)
```

### OData apply: multiple aggregations

```typescript
fetchOdata(Account).apply(f => ({ total: sum(f.revenue), min: min(f.revenue), max: max(f.revenue), avg: average(f.revenue), cnt: count() })).toString()
```

```
$apply=aggregate(log_revenue with sum as total,log_revenue with min as min,log_revenue with max as max,log_revenue with average as avg,$count as cnt)
```

## OData APPLY + GROUPBY

### OData apply: groupby single field

```typescript
fetchOdata(Account).apply(f => ({ city: groupby(f.city) })).toString()
```

```
$apply=groupby((log_city))
```

### OData apply: groupby + count

```typescript
fetchOdata(Account).apply(f => ({ city: groupby(f.city), count: count() })).toString()
```

```
$apply=groupby((log_city),aggregate($count as count))
```

### OData apply: groupby + sum

```typescript
fetchOdata(Account).apply(f => ({ city: groupby(f.city), totalRevenue: sum(f.revenue) })).toString()
```

```
$apply=groupby((log_city),aggregate(log_revenue with sum as totalRevenue))
```

### OData apply: groupby + all aggs

```typescript
fetchOdata(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue), min: min(f.revenue), max: max(f.revenue), avg: average(f.revenue), cnt: count() })).toString()
```

```
$apply=groupby((log_city),aggregate(log_revenue with sum as total,log_revenue with min as min,log_revenue with max as max,log_revenue with average as avg,$count as cnt))
```

### OData apply: groupby multi-field

```typescript
fetchOdata(Account).apply(f => ({ city: groupby(f.city), name: groupby(f.name) })).toString()
```

```
$apply=groupby((log_city,log_name))
```

### OData apply: groupby multi-field + count

```typescript
fetchOdata(Account).apply(f => ({ city: groupby(f.city), name: groupby(f.name), count: count() })).toString()
```

```
$apply=groupby((log_city,log_name),aggregate($count as count))
```

## OData APPLY + filter/orderby/top

### OData apply: groupby + post-apply filter (string)

```typescript
fetchOdata(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).filter("total gt 5000").toString()
```

```
$filter=total gt 5000&$apply=groupby((log_city),aggregate(log_revenue with sum as total))
```

### OData apply: groupby + orderby by string alias

```typescript
fetchOdata(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).orderby("total", "desc").toString()
```

```
$apply=groupby((log_city),aggregate(log_revenue with sum as total))&$orderby=total desc
```

### OData apply: groupby + orderby via alias proxy fn

```typescript
fetchOdata(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).orderby(aliases => aliases.total, "desc").toString()
```

```
$apply=groupby((log_city),aggregate(log_revenue with sum as total))&$orderby=total desc
```

### OData apply: groupby + top

```typescript
fetchOdata(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).top(10).toString()
```

```
$apply=groupby((log_city),aggregate(log_revenue with sum as total))&$top=10
```

### OData apply: groupby + filter + orderby + top

```typescript
fetchOdata(Account).apply(...).filter(...).orderby(...).top(...)
```

```
$filter=total gt 5000&$apply=groupby((log_city),aggregate(log_revenue with sum as total,log_revenue with average as avg))&$orderby=total desc&$top=5
```

## OData APPLY on Contact + Order

### OData apply: count on Contact

```typescript
fetchOdata(Contact).apply(f => ({ total: count() })).toString()
```

```
$apply=aggregate($count as total)
```

### OData apply: groupby name on Contact

```typescript
fetchOdata(Contact).apply(f => ({ name: groupby(f.name), cnt: count() })).toString()
```

```
$apply=groupby((log_name),aggregate($count as cnt))
```

### OData apply: count on Order

```typescript
fetchOdata(Order).apply(f => ({ total: count() })).toString()
```

```
$apply=aggregate($count as total)
```

### OData apply: groupby orderDate + sum total on Order

```typescript
fetchOdata(Order).apply(f => ({ orderDate: groupby(f.orderDate), totalSales: sum(f.total) })).toString()
```

```
$apply=groupby((log_orderdate),aggregate(log_total with sum as totalSales))
```

### OData apply: all aggs on Order total

```typescript
fetchOdata(Order).apply(f => ({ total: sum(f.total), min: min(f.total), max: max(f.total), avg: average(f.total), cnt: count() })).toString()
```

```
$apply=aggregate(log_total with sum as total,log_total with min as min,log_total with max as max,log_total with average as avg,$count as cnt)
```

### OData apply: groupby + filter + orderby + top on Order

```typescript
fetchOdata(Order).apply(...).filter(...).orderby(...).top(...)
```

```
$filter=totalSales gt 1000&$apply=groupby((log_orderdate),aggregate(log_total with sum as totalSales,log_total with average as avgSale))&$orderby=totalSales desc&$top=10
```

## OData APPLY on Ticket

### OData apply: count on Ticket

```typescript
fetchOdata(Ticket).apply(f => ({ total: count() })).toString()
```

```
$apply=aggregate($count as total)
```

### OData apply: groupby priority + count on Ticket

```typescript
fetchOdata(Ticket).apply(f => ({ priority: groupby(f.priority), count: count() })).toString()
```

```
$apply=groupby((log_priority),aggregate($count as count))
```

### OData apply: groupby title + sum priority on Ticket

```typescript
fetchOdata(Ticket).apply(f => ({ title: groupby(f.title), totalPriority: sum(f.priority) })).toString()
```

```
$apply=groupby((log_title),aggregate(log_priority with sum as totalPriority))
```

### OData apply: all aggs on Ticket + groupby + filter + orderby + top

```typescript
fetchOdata(Ticket).apply(...).filter(...).orderby(...).top(...)
```

```
$filter=total gt 5&$apply=groupby((log_priority),aggregate(log_priority with sum as total,log_priority with min as min,log_priority with max as max,log_priority with average as avg,$count as cnt))&$orderby=total desc&$top=5
```

## OData LAMBDA (any/all)

### OData filter: any on collection

```typescript
fetchOdata(Ticket).select("title").filter(f => any(f.tags, x => eq(x.label, "urgent"))).toString()
```

```
$select=log_title&$filter=log_tags/any(x: (x/log_label eq 'urgent'))
```

### OData filter: all on collection

```typescript
fetchOdata(Ticket).select("title").filter(f => all(f.tags, x => startsWith(x.label, "bug"))).toString()
```

```
$select=log_title&$filter=log_tags/all(x: startswith(x/log_label,'bug'))
```

### OData filter: any + other filters combined

```typescript
fetchOdata(Ticket).select("title").filter(f => and(gt(f.priority, 2), any(f.tags, x => eq(x.label, "urgent")))).toString()
```

```
$select=log_title&$filter=((log_priority gt 2) and log_tags/any(x: (x/log_label eq 'urgent')))
```

### OData filter: any + all combined

```typescript
fetchOdata(Ticket).select("title").filter(f => and(any(f.tags, x => eq(x.label, "urgent")), all(f.tags, x => startsWith(x.label, "b")))).toString()
```

```
$select=log_title&$filter=(log_tags/any(x: (x/log_label eq 'urgent')) and log_tags/all(x: startswith(x/log_label,'b')))
```

### OData filter: any nested in select + expand

```typescript
Ticket.select("title").expand("customer", sub => sub.select("name")).filter(f => any(f.tags, x => eq(x.label, "critical")))
```

```
$select=log_title&$filter=log_tags/any(x: (x/log_label eq 'critical'))&$expand=log_customer($select=log_name)
```

## FetchXML SELECT

### FetchXML select: single field

```typescript
fetchXml(Account).select(f => ({ accountName: f.name })).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="accountName" />
  </entity>
</fetch>
```

### FetchXML select: multiple fields

```typescript
fetchXml(Account).select(f => ({ accountName: f.name, revenue: f.revenue })).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="accountName" />
    <attribute name="log_revenue" alias="revenue" />
  </entity>
</fetch>
```

### FetchXML select: all fields

```typescript
fetchXml(Account).select().toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_id" alias="id" />
    <attribute name="log_name" alias="name" />
    <attribute name="log_revenue" alias="revenue" />
    <attribute name="log_city" alias="city" />
  </entity>
</fetch>
```

### FetchXML select: all fields on Contact

```typescript
fetchXml(Contact).select().toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_contact">
    <attribute name="log_id" alias="id" />
    <attribute name="log_name" alias="name" />
    <attribute name="log_email" alias="email" />
    <attribute name="log_account" alias="accountId" />
    <attribute name="log_account" alias="account" />
  </entity>
</fetch>
```

### FetchXML select: all fields on Order

```typescript
fetchXml(Order).select().toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_order">
    <attribute name="log_id" alias="id" />
    <attribute name="log_total" alias="total" />
    <attribute name="log_orderdate" alias="orderDate" />
    <attribute name="log_contact" alias="contactId" />
    <attribute name="log_contact" alias="contact" />
  </entity>
</fetch>
```

## FetchXML SELECT + FILTER

### FetchXML select + filter: eq

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => eq(f.city, "Seattle")).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <condition attribute="log_city" operator="eq" value="Seattle" />
    </filter>
  </entity>
</fetch>
```

### FetchXML select + filter: ne

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => ne(f.city, "NYC")).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <condition attribute="log_city" operator="ne" value="NYC" />
    </filter>
  </entity>
</fetch>
```

### FetchXML select + filter: gt

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => gt(f.revenue, 1000)).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <condition attribute="log_revenue" operator="gt" value="1000" />
    </filter>
  </entity>
</fetch>
```

### FetchXML select + filter: ge + lt + le

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => and(ge(f.revenue, 500), lt(f.revenue, 5000))).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <filter type="and"><condition attribute="log_revenue" operator="ge" value="500" /><condition attribute="log_revenue" operator="lt" value="5000" /></filter>
    </filter>
  </entity>
</fetch>
```

### FetchXML select + filter: contains

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => contains(f.name, "Corp")).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <condition attribute="log_name" operator="like" value="%Corp%" />
    </filter>
  </entity>
</fetch>
```

### FetchXML select + filter: startsWith

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => startsWith(f.name, "Acme")).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <condition attribute="log_name" operator="begins-with" value="Acme" />
    </filter>
  </entity>
</fetch>
```

### FetchXML select + filter: and

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => and(eq(f.city, "Seattle"), gt(f.revenue, 500))).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <filter type="and"><condition attribute="log_city" operator="eq" value="Seattle" /><condition attribute="log_revenue" operator="gt" value="500" /></filter>
    </filter>
  </entity>
</fetch>
```

### FetchXML select + filter: or

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => or(eq(f.city, "Seattle"), eq(f.city, "NYC"))).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <filter type="or"><condition attribute="log_city" operator="eq" value="Seattle" /><condition attribute="log_city" operator="eq" value="NYC" /></filter>
    </filter>
  </entity>
</fetch>
```

### FetchXML select + filter: not

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => not(eq(f.city, "NYC"))).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <filter type="and"><filter type="or"><condition attribute="log_city" operator="eq" value="NYC" /></filter></filter>
    </filter>
  </entity>
</fetch>
```

### FetchXML select + filter: isNotNull

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => isNotNull(f.city)).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <condition attribute="log_city" operator="not-null" />
    </filter>
  </entity>
</fetch>
```

### FetchXML select + filter: and + or combined

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => and(or(eq(f.city, "Seattle"), eq(f.city, "NYC")), gt(f.revenue, 1000))).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <filter type="and"><filter type="or"><condition attribute="log_city" operator="eq" value="Seattle" /><condition attribute="log_city" operator="eq" value="NYC" /></filter><condition attribute="log_revenue" operator="gt" value="1000" /></filter>
    </filter>
  </entity>
</fetch>
```

### FetchXML select + filter: multiple chained

```typescript
fetchXml(Account).select(f => ({ name: f.name })).filter(f => eq(f.city, "Seattle")).filter(f => gt(f.revenue, 500)).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <filter type="and">
      <condition attribute="log_city" operator="eq" value="Seattle" />
      <condition attribute="log_revenue" operator="gt" value="500" />
    </filter>
  </entity>
</fetch>
```

## FetchXML ORDERBY + TOP + DISTINCT

### FetchXML select + orderby asc

```typescript
fetchXml(Account).select(f => ({ name: f.name })).orderby(f => f.name).toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <order attribute='log_name' />
  </entity>
</fetch>
```

### FetchXML select + orderby desc

```typescript
fetchXml(Account).select(f => ({ name: f.name })).orderby(f => f.revenue, "desc").toXml()
```

```
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <order attribute='log_revenue' descending='true' />
  </entity>
</fetch>
```

### FetchXML select + top

```typescript
fetchXml(Account).select(f => ({ name: f.name })).top(5).toXml()
```

```
<fetch version="1.0" mapping="logical" top='5'>
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
  </entity>
</fetch>
```

### FetchXML select + distinct

```typescript
fetchXml(Account).select(f => ({ city: f.city })).distinct().toXml()
```

```
<fetch version="1.0" mapping="logical" distinct="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" />
  </entity>
</fetch>
```

### FetchXML select + filter + orderby + top + distinct

```typescript
fetchXml(Account).select(...).filter(...).orderby(...).top(10).distinct()
```

```
<fetch version="1.0" mapping="logical" top='10' distinct="true">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <attribute name="log_city" alias="city" />
    <order attribute='log_name' />
    <filter type="and">
      <condition attribute="log_revenue" operator="gt" value="100" />
    </filter>
  </entity>
</fetch>
```

## FetchXML JOIN (1-level)

### FetchXML join: inner (Account → Contact), filter-only

```typescript
fetchXml(Account).select(f => ({ name: f.name })).join("inner", Contact, "id", "accountId", sub => sub.filter(f => eq(f.name, "Jane")))
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_1" link-type="inner">
      <filter type="and">
        <condition attribute="log_name" operator="eq" value="Jane" />
      </filter>
      <attribute name="log_id" alias="id" />
      <attribute name="log_name" alias="name" />
      <attribute name="log_email" alias="email" />
      <attribute name="log_account" alias="accountId" />
    </link-entity>
  </entity>
</fetch>
```

### FetchXML join: inner with select

```typescript
fetchXml(Account).select(f => ({ name: f.name })).join("inner", Contact, "accountId", "id", sub => sub.select(f => ({ contactEmail: f.email })))
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_1" link-type="inner">
      <attribute name="log_email" alias="contactEmail" />
    </link-entity>
  </entity>
</fetch>
```

### FetchXML join: inner + filter on joined

```typescript
fetchXml(Account).select(f => ({ name: f.name })).join("inner", Contact, "accountId", "id", sub => sub.select(f => ({ email: f.email })).filter(f => contains(f.email, "example")))
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_1" link-type="inner">
      <filter type="and">
        <condition attribute="log_email" operator="like" value="%example%" />
      </filter>
      <attribute name="log_email" alias="email" />
    </link-entity>
  </entity>
</fetch>
```

### FetchXML join: outer

```typescript
fetchXml(Account).select(f => ({ name: f.name })).join("outer", Contact, "accountId", "id", sub => sub.select(f => ({ contactName: f.name })))
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_1" link-type="outer">
      <attribute name="log_name" alias="contactName" />
    </link-entity>
  </entity>
</fetch>
```

### FetchXML join: any

```typescript
fetchXml(Account).select(f => ({ name: f.name })).join("any", Contact, "accountId", "id", sub => sub.filter(f => eq(f.name, "Jane")))
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_1" link-type="any">
      <filter type="and">
        <condition attribute="log_name" operator="eq" value="Jane" />
      </filter>
    </link-entity>
  </entity>
</fetch>
```

### FetchXML join: not any

```typescript
fetchXml(Account).select(f => ({ name: f.name })).join("not any", Contact, "accountId", "id", sub => sub.filter(f => eq(f.name, "Jane")))
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_1" link-type="not any">
      <filter type="and">
        <condition attribute="log_name" operator="eq" value="Jane" />
      </filter>
    </link-entity>
  </entity>
</fetch>
```

### FetchXML join: all

```typescript
fetchXml(Account).select(f => ({ name: f.name })).join("all", Contact, "accountId", "id", sub => sub.filter(f => contains(f.name, "Smith")))
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_1" link-type="all">
      <filter type="and">
        <condition attribute="log_name" operator="like" value="%Smith%" />
      </filter>
    </link-entity>
  </entity>
</fetch>
```

### FetchXML join: inner with select + filter + orderby on joined

```typescript
fetchXml(Account).select(f => ({ name: f.name })).join("inner", Contact, "accountId", "id", sub => sub.select(f => ({ contactName: f.name, email: f.email })).filter(f => contains(f.email, "example")).orderby(f => f.name))
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_1" link-type="inner">
      <filter type="and">
        <condition attribute="log_email" operator="like" value="%example%" />
      </filter>
      <attribute name="log_name" alias="contactName" />
      <attribute name="log_email" alias="email" />
      <order attribute='log_name' />
    </link-entity>
  </entity>
</fetch>
```

## FetchXML JOIN (nested)

### FetchXML nested join: Account → Contact → Order

```typescript
fetchXml(Account).select(f => ({ name: f.name })).join("inner", Contact, "id", "accountId", sub => sub.select(f => ({ contactName: f.name })).join("inner", Order, "contactId", "id", sub2 => sub2.select(f => ({ orderTotal: f.total }))))
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_2" link-type="inner">
      <attribute name="log_name" alias="contactName" />
      <link-entity name="log_order" from="log_contact" to="log_id" alias="auto_link_1" link-type="inner">
        <attribute name="log_total" alias="orderTotal" />
      </link-entity>
    </link-entity>
  </entity>
</fetch>
```

### FetchXML nested join: filters everywhere

```typescript
Account.filter + join Contact (select + filter) + join Order (select + filter)
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_2" link-type="inner">
      <filter type="and">
        <condition attribute="log_email" operator="like" value="%example%" />
      </filter>
      <attribute name="log_name" alias="contactName" />
      <attribute name="log_email" alias="email" />
      <link-entity name="log_order" from="log_contact" to="log_id" alias="auto_link_1" link-type="inner">
        <filter type="and">
          <condition attribute="log_total" operator="gt" value="100" />
        </filter>
        <attribute name="log_total" alias="orderTotal" />
      </link-entity>
    </link-entity>
  </entity>
</fetch>
```

### FetchXML nested join: orderby at multiple levels + top

```typescript
Account.orderby + join Contact (orderby) + join Order (orderby) + top(50)
```

```xml
<fetch version="1.0" mapping="logical" top='50'>
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <order attribute='log_name' />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_2" link-type="inner">
      <attribute name="log_name" alias="contactName" />
      <order attribute='log_name' />
      <link-entity name="log_order" from="log_contact" to="log_id" alias="auto_link_1" link-type="inner">
        <attribute name="log_total" alias="orderTotal" />
        <attribute name="log_orderdate" alias="orderDate" />
        <order attribute='log_total' descending='true' />
      </link-entity>
    </link-entity>
  </entity>
</fetch>
```

### FetchXML: Contact → Account + Contact → Order (multiple joins same level)

```typescript
fetchXml(Contact).select(f => ({ contactName: f.name })).join("inner", Account, "id", "accountId", sub => sub.select(f => ({ accountName: f.name }))).join("inner", Order, "contactId", "id", sub => sub.select(f => ({ orderTotal: f.total })))
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_contact">
    <attribute name="log_name" alias="contactName" />
    <link-entity name="log_account" from="log_id" to="log_account" alias="auto_link_1" link-type="inner">
      <attribute name="log_name" alias="accountName" />
    </link-entity>
    <link-entity name="log_order" from="log_contact" to="log_id" alias="auto_link_2" link-type="inner">
      <attribute name="log_total" alias="orderTotal" />
    </link-entity>
  </entity>
</fetch>
```

### FetchXML: Contact → Account + Contact → Order with filters

```typescript
Contact.select + join Account (select + filter) + join Order (select + filter + orderby)
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_contact">
    <attribute name="log_name" alias="contactName" />
    <attribute name="log_email" alias="email" />
    <filter type="and">
      <condition attribute="log_email" operator="like" value="%example%" />
    </filter>
    <link-entity name="log_account" from="log_id" to="log_account" alias="auto_link_1" link-type="inner">
      <filter type="and">
        <condition attribute="log_city" operator="eq" value="Seattle" />
      </filter>
      <attribute name="log_name" alias="accountName" />
      <attribute name="log_city" alias="city" />
    </link-entity>
    <link-entity name="log_order" from="log_contact" to="log_id" alias="auto_link_2" link-type="inner">
      <filter type="and">
        <condition attribute="log_total" operator="gt" value="50" />
      </filter>
      <attribute name="log_total" alias="orderTotal" />
      <attribute name="log_orderdate" alias="orderDate" />
      <order attribute='log_total' descending='true' />
    </link-entity>
  </entity>
</fetch>
```

### FetchXML triple nested: Account → Contact → Order all sub-selects

```typescript
Account.all fields + join Contact (all fields + filter) + join Order (select + filter + orderby)
```

```xml
<fetch version="1.0" mapping="logical">
  <entity name="log_account">
    <attribute name="log_id" alias="id" />
    <attribute name="log_name" alias="name" />
    <attribute name="log_revenue" alias="revenue" />
    <attribute name="log_city" alias="city" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_2" link-type="inner">
      <filter type="and">
        <condition attribute="log_name" operator="like" value="%Smith%" />
      </filter>
      <attribute name="log_name" alias="name" />
      <attribute name="log_email" alias="email" />
      <link-entity name="log_order" from="log_contact" to="log_id" alias="auto_link_1" link-type="inner">
        <filter type="and">
          <condition attribute="log_total" operator="gt" value="100" />
        </filter>
        <attribute name="log_total" alias="total" />
        <attribute name="log_orderdate" alias="date" />
        <order attribute='log_total' descending='true' />
      </link-entity>
    </link-entity>
  </entity>
</fetch>
```

## FetchXML APPLY (aggregate)

### FetchXML apply: count

```typescript
fetchXml(Account).apply(f => ({ total: count() })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_id" alias="total" aggregate='count' />
  </entity>
</fetch>
```

### FetchXML apply: sum

```typescript
fetchXml(Account).apply(f => ({ totalRevenue: sum(f.revenue) })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_revenue" alias="totalRevenue" aggregate='sum' />
  </entity>
</fetch>
```

### FetchXML apply: min

```typescript
fetchXml(Account).apply(f => ({ minRevenue: min(f.revenue) })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_revenue" alias="minRevenue" aggregate='min' />
  </entity>
</fetch>
```

### FetchXML apply: max

```typescript
fetchXml(Account).apply(f => ({ maxRevenue: max(f.revenue) })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_revenue" alias="maxRevenue" aggregate='max' />
  </entity>
</fetch>
```

### FetchXML apply: average

```typescript
fetchXml(Account).apply(f => ({ avgRevenue: average(f.revenue) })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_revenue" alias="avgRevenue" aggregate='average' />
  </entity>
</fetch>
```

### FetchXML apply: multiple aggs

```typescript
fetchXml(Account).apply(f => ({ total: sum(f.revenue), min: min(f.revenue), max: max(f.revenue), avg: average(f.revenue), cnt: count() })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_revenue" alias="total" aggregate='sum' />
    <attribute name="log_revenue" alias="min" aggregate='min' />
    <attribute name="log_revenue" alias="max" aggregate='max' />
    <attribute name="log_revenue" alias="avg" aggregate='average' />
    <attribute name="log_id" alias="cnt" aggregate='count' />
  </entity>
</fetch>
```

## FetchXML APPLY + GROUPBY

### FetchXML apply: groupby + count

```typescript
fetchXml(Account).apply(f => ({ city: groupby(f.city), count: count() })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" groupby='true' />
    <attribute name="log_id" alias="count" aggregate='count' />
  </entity>
</fetch>
```

### FetchXML apply: groupby + sum

```typescript
fetchXml(Account).apply(f => ({ city: groupby(f.city), totalRevenue: sum(f.revenue) })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" groupby='true' />
    <attribute name="log_revenue" alias="totalRevenue" aggregate='sum' />
  </entity>
</fetch>
```

### FetchXML apply: groupby + all aggs

```typescript
fetchXml(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue), min: min(f.revenue), max: max(f.revenue), avg: average(f.revenue), cnt: count() })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" groupby='true' />
    <attribute name="log_revenue" alias="total" aggregate='sum' />
    <attribute name="log_revenue" alias="min" aggregate='min' />
    <attribute name="log_revenue" alias="max" aggregate='max' />
    <attribute name="log_revenue" alias="avg" aggregate='average' />
    <attribute name="log_id" alias="cnt" aggregate='count' />
  </entity>
</fetch>
```

### FetchXML apply: groupby multi-field + count

```typescript
fetchXml(Account).apply(f => ({ city: groupby(f.city), name: groupby(f.name), count: count() })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" groupby='true' />
    <attribute name="log_name" alias="name" groupby='true' />
    <attribute name="log_id" alias="count" aggregate='count' />
  </entity>
</fetch>
```

### FetchXML apply: groupby on name + sum

```typescript
fetchXml(Account).apply(f => ({ name: groupby(f.name), totalRevenue: sum(f.revenue) })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_name" alias="name" groupby='true' />
    <attribute name="log_revenue" alias="totalRevenue" aggregate='sum' />
  </entity>
</fetch>
```

## FetchXML APPLY + filter/orderby/top

### FetchXML apply: groupby + pre-filter

```typescript
fetchXml(Account).filter(f => eq(f.city, "Seattle")).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" groupby='true' />
    <attribute name="log_revenue" alias="total" aggregate='sum' />
    <filter type="and">
      <condition attribute="log_city" operator="eq" value="Seattle" />
    </filter>
  </entity>
</fetch>
```

### FetchXML apply: groupby + orderby

```typescript
fetchXml(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).orderby("total", "desc").toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" groupby='true' />
    <attribute name="log_revenue" alias="total" aggregate='sum' />
    <order entityname='total' attribute='desc' />
  </entity>
</fetch>
```

### FetchXML apply: groupby + top

```typescript
fetchXml(Account).apply(f => ({ city: groupby(f.city), total: sum(f.revenue) })).top(10).toXml()
```

```
<fetch version="1.0" mapping="logical" top='10' aggregate="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" groupby='true' />
    <attribute name="log_revenue" alias="total" aggregate='sum' />
  </entity>
</fetch>
```

### FetchXML apply: groupby + pre-filter + orderby + top

```typescript
fetchXml(Account).filter(...).apply(...).orderby(...).top(5)
```

```
<fetch version="1.0" mapping="logical" top='5' aggregate="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" groupby='true' />
    <attribute name="log_revenue" alias="total" aggregate='sum' />
    <attribute name="log_revenue" alias="avg" aggregate='average' />
    <order entityname='total' attribute='desc' />
    <filter type="and">
      <condition attribute="log_revenue" operator="gt" value="100" />
    </filter>
  </entity>
</fetch>
```

### FetchXML apply: groupby on Contact

```typescript
fetchXml(Contact).apply(f => ({ name: groupby(f.name), count: count() })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_contact">
    <attribute name="log_name" alias="name" groupby='true' />
    <attribute name="log_id" alias="count" aggregate='count' />
  </entity>
</fetch>
```

### FetchXML apply: groupby on Order

```typescript
fetchXml(Order).apply(f => ({ orderDate: groupby(f.orderDate), totalSales: sum(f.total), avgSale: average(f.total) })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_order">
    <attribute name="log_orderdate" alias="orderDate" groupby='true' />
    <attribute name="log_total" alias="totalSales" aggregate='sum' />
    <attribute name="log_total" alias="avgSale" aggregate='average' />
  </entity>
</fetch>
```

### FetchXML apply: groupby + pre-filter + orderby + top on Order

```typescript
fetchXml(Order).filter(...).apply(...).orderby(...).top(10)
```

```
<fetch version="1.0" mapping="logical" top='10' aggregate="true">
  <entity name="log_order">
    <attribute name="log_orderdate" alias="orderDate" groupby='true' />
    <attribute name="log_total" alias="totalSales" aggregate='sum' />
    <attribute name="log_total" alias="avgSale" aggregate='average' />
    <order entityname='totalSales' attribute='desc' />
    <filter type="and">
      <condition attribute="log_total" operator="gt" value="50" />
    </filter>
  </entity>
</fetch>
```

### FetchXML apply: groupby on Ticket

```typescript
fetchXml(Ticket).apply(f => ({ priority: groupby(f.priority), count: count() })).toXml()
```

```
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_ticket">
    <attribute name="log_priority" alias="priority" groupby='true' />
    <attribute name="log_id" alias="count" aggregate='count' />
  </entity>
</fetch>
```

### FetchXML apply: groupby + all aggs + pre-filter + orderby + top on Ticket

```typescript
fetchXml(Ticket).filter(...).apply(...).orderby(...).top(10)
```

```
<fetch version="1.0" mapping="logical" top='10' aggregate="true">
  <entity name="log_ticket">
    <attribute name="log_priority" alias="priority" groupby='true' />
    <attribute name="log_priority" alias="total" aggregate='sum' />
    <attribute name="log_priority" alias="min" aggregate='min' />
    <attribute name="log_priority" alias="max" aggregate='max' />
    <attribute name="log_priority" alias="avg" aggregate='average' />
    <attribute name="log_id" alias="cnt" aggregate='count' />
    <order entityname='total' attribute='desc' />
    <filter type="and">
      <condition attribute="log_priority" operator="gt" value="0" />
    </filter>
  </entity>
</fetch>
```

## FetchXML APPLY + JOIN

### FetchXML apply + join: groupby across join

```typescript
fetchXml(Account).join("inner", Contact, "id", "accountId", sub => sub.filter(...)).apply(f => ({ city: groupby(f.city), count: count() }))
```

```xml
<fetch version="1.0" mapping="logical" aggregate="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" groupby='true' />
    <attribute name="log_id" alias="count" aggregate='count' />
  </entity>
</fetch>
```

### FetchXML apply + join with pre-filter + orderby + top

```typescript
Account.filter + join Contact + apply groupby + orderby + top
```

```xml
<fetch version="1.0" mapping="logical" top='10' aggregate="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" groupby='true' />
    <attribute name="log_revenue" alias="total" aggregate='sum' />
    <order entityname='total' attribute='desc' />
    <filter type="and">
      <condition attribute="log_revenue" operator="gt" value="100" />
    </filter>
  </entity>
</fetch>
```

### FetchXML apply + join with select + filter on join + groupby + all aggs

```typescript
Account + join Contact (select + filter) + apply groupby + all aggs + orderby + top
```

```xml
<fetch version="1.0" mapping="logical" top='25' aggregate="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" groupby='true' />
    <attribute name="log_revenue" alias="total" aggregate='sum' />
    <attribute name="log_revenue" alias="min" aggregate='min' />
    <attribute name="log_revenue" alias="max" aggregate='max' />
    <attribute name="log_revenue" alias="avg" aggregate='average' />
    <attribute name="log_id" alias="cnt" aggregate='count' />
    <order entityname='total' attribute='desc' />
  </entity>
</fetch>
```

## FetchXML MISC COMBOS

### FetchXML: select all + filter + orderby + top

```typescript
fetchXml(Account).select().filter(f => eq(f.city, "Seattle")).orderby(f => f.name).top(10).toXml()
```

```
<fetch version="1.0" mapping="logical" top='10'>
  <entity name="log_account">
    <attribute name="log_id" alias="id" />
    <attribute name="log_name" alias="name" />
    <attribute name="log_revenue" alias="revenue" />
    <attribute name="log_city" alias="city" />
    <order attribute='log_name' />
    <filter type="and">
      <condition attribute="log_city" operator="eq" value="Seattle" />
    </filter>
  </entity>
</fetch>
```

### FetchXML: distinct + filter

```typescript
fetchXml(Account).select(f => ({ city: f.city })).filter(f => isNotNull(f.city)).distinct().toXml()
```

```
<fetch version="1.0" mapping="logical" distinct="true">
  <entity name="log_account">
    <attribute name="log_city" alias="city" />
    <filter type="and">
      <condition attribute="log_city" operator="not-null" />
    </filter>
  </entity>
</fetch>
```

### FetchXML: join + select + filter + distinct + top

```typescript
Account.select + join Contact.select.filter + distinct + top
```

```
<fetch version="1.0" mapping="logical" top='25' distinct="true">
  <entity name="log_account">
    <attribute name="log_name" alias="name" />
    <attribute name="log_city" alias="city" />
    <link-entity name="log_contact" from="log_account" to="log_id" alias="auto_link_1" link-type="inner">
      <filter type="and">
        <condition attribute="log_name" operator="like" value="%Smith%" />
      </filter>
      <attribute name="log_name" alias="contactName" />
    </link-entity>
  </entity>
</fetch>
```

