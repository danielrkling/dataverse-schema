const Etag = Symbol("etag");
const globalConfig = {
  url: `${location.origin}/api/data/v9.2`,
  headers: {
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    "Content-Type": "application/json; charset=utf-8",
    "If-None-Match": "null",
    Accept: "application/json",
    MSCRMCallerID: localStorage.getItem("MSCRMCallerID") ?? "",
    CallerObjectId: localStorage.getItem("CallerObjectId") ?? ""
  }
};
function setConfig(config) {
  globalConfig.headers = { ...globalConfig.headers, ...config.headers };
  if (config.url) globalConfig.url = config.url;
}
const parenthesesRegEx = /\(([^)]*)\)/g;
async function tryFetch(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...globalConfig.headers,
      ...init?.headers
    }
  });
  if (response.headers.get("Content-Type")?.includes("application/json")) {
    const data = await response.json();
    if (data.error) {
      if (data.error.code === "0x80060891") return null;
      throw data.error;
    }
    return data;
  }
  if (!response.ok) {
    throw new Error(response.status + "-" + response.statusText);
  }
  if (response.status == 204) {
    const entityId = response.headers.get("OData-EntityId");
    if (entityId) return parenthesesRegEx.exec(entityId)?.[1];
    return;
  }
  return await response.text();
}
async function fetchChoices(name) {
  return tryFetch(`${globalConfig.url}/GlobalOptionSetDefinitions(Name=${wrapString(name)})`).then(
    (v) => mapChoices(v)
  );
}
function mapChoices(data) {
  return [...data.Options].map((option) => ({
    value: Number(option.Value),
    color: String(option.Color),
    label: String(option.Label.UserLocalizedLabel.Label),
    description: String(option.Description.UserLocalizedLabel.Label)
  }));
}
function xml(raw, ...values) {
  let result = String.raw(raw, values);
  result = result.replace(/>\s*/g, ">");
  result = result.replace(/\s*</g, "<");
  return result;
}
async function fetchXml(entitySetName, xml2) {
  return tryFetch(`${globalConfig.url}/${entitySetName}?fetchXml=${xml2}`).then(
    (v) => v.value
  );
}
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const url = reader.result;
      const index = url?.toString().indexOf("base64") ?? 0;
      resolve(url?.slice(index + 7));
    };
    reader.onerror = reject;
  });
}
function base64ImageToURL(base64) {
  return `data:${detectImageType(base64)};base64,${base64}`;
}
function detectImageType(base64) {
  if (base64.startsWith("iVBORw0KGgoAAAANSUhEUgAA")) {
    return "image/png";
  } else if (base64.startsWith("/9j/4AAQSkZJRgABAQEAYABgAAD/")) {
    return "image/jpeg";
  } else if (base64.startsWith("R0lGODlh")) {
    return "image/gif";
  } else {
    return "image/png";
  }
}
function getImageUrl(entity, name, id) {
  return `${location.origin}/Image/download.aspx?Entity=${entity}&Attribute=${name}&Id=${id}&Full=true`;
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
const rxGUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const rxDateOnly = /^\d{4}-\d{2}-\d{2}$/;
function wrapString(value) {
  return typeof value === "string" && !rxGUID.test(value) && !rxDateOnly.test(value) ? `'${value}'` : String(value);
}
function attachEtag(v) {
  if (v && typeof v === "object")
    v[Etag] = v["@odata.etag"];
  return v;
}
function mergeRecords(prevRecords, newRecords) {
  const prevMap = new Map(prevRecords.map((v) => [v[Etag], v]));
  return newRecords.map((v) => prevMap.get(v[Etag]) ?? v);
}

async function RetrieveAadUserRoles(aadId) {
  return tryFetch(
    `${globalConfig.url}/RetrieveAadUserRoles(DirectoryObjectId=${aadId})?$select=name`
  ).then((d) => new Set(d.value.map((r) => r.name)));
}

async function RetrieveTotalRecordCount(logicalName) {
  return tryFetch(
    `${globalConfig.url}/RetrieveTotalRecordCount(EntityNames=['${logicalName}'])`
  ).then((d) => d.Values[0]);
}

async function WhoAmI() {
  return tryFetch(`${globalConfig.url}/WhoAmI()`).then((r) => ({
    BusinessUnitId: r.BusinessUnitId,
    UserId: r.UserId,
    OrganizationId: r.OrganizationId
  }));
}

async function updatePropertyValue(entitySetName, id, propertyName, value) {
  await tryFetch(
    `${globalConfig.url}/${entitySetName}(${id})/${propertyName}`,
    {
      method: "PUT",
      body: JSON.stringify({ value })
    }
  );
  return id;
}

async function activateRecord(entitySetName, id) {
  return updatePropertyValue(entitySetName, id, "statecode", 0);
}

async function associateRecord(entitySetName, parentId, propertyName, childEntitySetName, childId) {
  await tryFetch(
    `${globalConfig.url}/${entitySetName}(${parentId})/${propertyName}/$ref`,
    {
      method: "PUT",
      body: JSON.stringify({
        "@odata.id": `${globalConfig.url}/${childEntitySetName}(${childId})`
      })
    }
  );
  return childId;
}

async function disssociateRecord(entitySetName, parentId, propertyName, childId) {
  await tryFetch(
    `${globalConfig.url}/${entitySetName}(${parentId})/${propertyName}${childId ? `(${childId})` : ""}/$ref`,
    {
      method: "DELETE"
    }
  );
  return childId ?? parentId;
}

async function getAssociatedRecords(entitySetName, id, navigationPropertyName, query = "") {
  return tryFetch(
    `${globalConfig.url}/${entitySetName}(${id})/${navigationPropertyName}?${query}`
  ).then((r) => r.value.map(attachEtag));
}

async function associateRecordToList(entitySetName, parentId, propertyName, childEntitySetName, childPrimaryKeyName, childIds) {
  const currentIds = (await getAssociatedRecords(
    entitySetName,
    parentId,
    propertyName,
    `$select=${childPrimaryKeyName}`
  )).map((r) => r[childPrimaryKeyName]);
  const promises = [];
  for (const id of childIds) {
    if (!currentIds.includes(id))
      promises.push(
        associateRecord(
          entitySetName,
          parentId,
          propertyName,
          childEntitySetName,
          id
        )
      );
  }
  for (const id of currentIds) {
    if (!childIds.includes(id))
      promises.push(
        disssociateRecord(entitySetName, parentId, propertyName, id)
      );
  }
  await Promise.all(promises);
  return childIds;
}

async function deactivateRecord(entitySetName, id) {
  return updatePropertyValue(entitySetName, id, "statecode", 1);
}

async function deletePropertyValue(entitySetName, id, propertyName) {
  await tryFetch(
    `${globalConfig.url}/${entitySetName}(${id})/${propertyName}`,
    {
      method: "DELETE"
    }
  );
  return id;
}

async function deleteRecord(entitySetName, id) {
  await tryFetch(`${globalConfig.url}/${entitySetName}(${id})`, {
    method: "DELETE"
  });
  return id;
}

async function getAssociatedRecord(entitySetName, id, navigationPropertyName, query) {
  return tryFetch(
    `${globalConfig.url}/${entitySetName}(${id})/${navigationPropertyName}?${query}`
  ).then(attachEtag);
}

async function getNextLink(result) {
  if (result["@odata.nextLink"]) {
    const r = await getNextLink(await tryFetch(result["@odata.nextLink"]));
    return [...result.value, ...r];
  }
  return result.value;
}

function getPropertyRawValueURL(entitySetName, id, propertyName) {
  return `${globalConfig.url}/${entitySetName}(${id})/${propertyName}/$value`;
}

async function getPropertyRawValue(entitySetName, id, propertyName) {
  return tryFetch(getPropertyRawValueURL(entitySetName, id, propertyName));
}

async function getPropertyValue(entitySetName, id, propertyName) {
  return tryFetch(
    `${globalConfig.url}/${entitySetName}(${id})/${propertyName}`
  ).then((r) => r.value);
}

async function getRecord(entitySetName, id, query) {
  return tryFetch(`${globalConfig.url}/${entitySetName}(${id})?${query}`).then(attachEtag);
}

async function getRecords(entitySetName, query) {
  return tryFetch(`${globalConfig.url}/${entitySetName}?${query}`).then(getNextLink).then((v) => v.map(attachEtag));
}

async function patchRecord(entitySetName, id, value, query = "") {
  return tryFetch(`${globalConfig.url}/${entitySetName}(${id})?${query}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify(value)
  });
}

async function postRecord(entitySetName, value, query = "") {
  return tryFetch(`${globalConfig.url}/${entitySetName}?${query}`, {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify(value)
  });
}

async function postRecordGetId(entitySetName, value) {
  return tryFetch(`${globalConfig.url}/${entitySetName}`, {
    method: "POST",
    body: JSON.stringify(value)
  });
}

function required() {
  return (v) => {
    if (!v) return "Required";
  };
}

class Schema {
  name;
  kind = "schema";
  type = "schema";
  /**
   * The default value of the property. This is a private field.
   */
  #default;
  /**
   * Creates a new Property instance.
   *
   * @param name The name of the property.
   * @param defaultValue The default value for the property.
   */
  constructor(name, defaultValue) {
    this.name = name;
    this.#default = defaultValue;
  }
  /**
   * Sets the default value of the property.
   *
   * @param value The new default value.
   * @returns The Property instance for chaining.
   */
  setDefault(value) {
    this.#default = value;
    return this;
  }
  /**
   * Gets the default value of the property.
   *
   * @returns The default value.
   */
  getDefault() {
    return this.#default;
  }
  /**
   * Indicates if the property is read-only. This is a private field.
   */
  #readOnly = false;
  /**
   * Sets whether the property is read-only.
   *
   * @param [value=true] True if the property should be read-only, false otherwise. Defaults to true.
   * @returns The Property instance for chaining.
   */
  setReadOnly(value = true) {
    this.#readOnly = value;
    return this;
  }
  /**
   * Gets whether the property is read-only.
   *
   * @returns True if the property is read-only, false otherwise.
   */
  getReadOnly() {
    return this.#readOnly;
  }
  /**
   * An array of validators associated with this property.
   */
  #validators = [];
  /**
   * Adds a validator to the property.
   *
   * @param v The validator function or object to add.
   * @returns The Property instance for chaining.
   */
  check(v) {
    this.#validators.push(v);
    return this;
  }
  /**
   * Adds a required validator to the property.
   *
   * @returns The Property instance for chaining.
   */
  required() {
    return this.check(required());
  }
  /**
   * Transforms a value received from Dataverse into the property's type.
   * By default, it returns the value as is. Subclasses can override this for custom transformations.
   *
   * @param value The value received from Dataverse.
   * @returns The transformed value of type T.
   */
  transformValueFromDataverse(value) {
    return value;
  }
  /**
   * Transforms the property's value into a format suitable for sending to Dataverse.
   * By default, it returns the value as is. Subclasses can override this for custom transformations.
   *
   * @param value The property's value.
   * @returns The transformed value suitable for Dataverse.
   */
  transformValueToDataverse(value) {
    return value;
  }
  getIssues(value, path = []) {
    const issues = [];
    this.#validators.forEach((fn) => {
      try {
        let message = fn(value);
        if (message) {
          issues.push({
            message,
            path
          });
        }
      } catch ({ message }) {
        issues.push({
          message,
          path
        });
      }
    });
    return issues;
  }
  validate(value, path = []) {
    const issues = this.getIssues(value, path);
    return issues.length > 0 ? { issues } : {
      value
    };
  }
  parse(value) {
    const result = this.validate(value);
    if (result.issues) {
      throw new Error(JSON.stringify(result.issues), {});
    } else {
      return result.value;
    }
  }
  /**
   * Provides access to the standard schema properties for this property.
   * This is a computed property.
   *
   * @returns An object containing the standard schema properties, including version, vendor, and a validation function.
   */
  get ["~standard"]() {
    return {
      version: 1,
      vendor: "dataverse-schema",
      validate: (v) => this.validate(v)
    };
  }
}

function isType(type) {
  return (v) => {
    if (typeof v !== type) {
      return "Not of type " + type;
    }
  };
}

class BooleanProperty extends Schema {
  /**
   * The kind of schema element for a boolean property, which is "value".
   */
  kind = "value";
  /**
   * The type of the property, which is "boolean".
   */
  type = "boolean";
  /**
   * Creates a new BooleanProperty instance.
   *
   * @param name The name of the boolean property.
   */
  constructor(name) {
    super(name, false);
    this.check(isType("boolean"));
  }
}
function boolean(name) {
  return new BooleanProperty(name);
}

class CollectionProperty extends Schema {
  kind = "navigation";
  type = "collection";
  #getTable;
  /**
   * Creates a new CollectionProperty instance.
   *
   * @param name The name of the collection property.
   * @param getTable A function that, when called, returns the Table definition for the related records. This is used to avoid circular dependencies.
   */
  constructor(name, getTable) {
    super(name, []);
    this.#getTable = getTable;
    this.check(
      (v) => !Array.isArray(v) ? "value is not an array" : void 0
    );
  }
  #table;
  get table() {
    return this.#table ??= this.#getTable();
  }
  /**
   * Transforms an array of values received from Dataverse into an array of transformed related records.
   * It iterates over the input array and uses the `transformValueFromDataverse` method of the related Table to transform each individual record.
   *
   * @param value An array of raw data representing the related records from Dataverse.
   * @returns An array of transformed related records of type `Infer<TProperties>[]`.
   */
  transformValueFromDataverse(value) {
    return Array.from(value).map(
      (v) => this.table.transformValueFromDataverse(v)
    );
  }
  getIssues(value, path = []) {
    const issues = super.getIssues(value, path);
    if (Array.isArray(value)) {
      issues.push(...value.map((v, i) => this.table.getIssues(v, [...path, i])).flat(1));
    }
    return issues;
  }
}
function collection(name, getTable) {
  return new CollectionProperty(name, getTable);
}

class DateProperty extends Schema {
  /**
   * The kind of schema element for a date property, which is "value".
   */
  kind = "value";
  /**
   * The type of the property, which is "date".
   */
  type = "date";
  /**
   * Creates a new DateProperty instance.
   *
   * @param name The name of the date property.
   */
  constructor(name) {
    super(name, null);
    this.check(
      (v) => v === null || v instanceof Date ? void 0 : "value is not Date or null"
    );
  }
  /**
   * Transforms a value received from Dataverse into a Date object or null.
   * If the value is null, it returns null. Otherwise, it creates a new Date object from the Dataverse value.
   *
   * @param value The value received from Dataverse.
   * @returns A Date object or null.
   */
  transformValueFromDataverse(value) {
    if (value === null) return null;
    return new Date(value);
  }
}
function date(name) {
  return new DateProperty(name);
}

class DateOnlyProperty extends Schema {
  /**
   * The kind of schema element for a date property, which is "value".
   */
  kind = "value";
  /**
   * The type of the property, which is "date".
   */
  type = "dateOnly";
  /**
   * Creates a new DateProperty instance.
   *
   * @param name The name of the date property.
   */
  constructor(name) {
    super(name, null);
    this.check(
      (v) => v === null || v instanceof Date ? void 0 : "value is not Date or null"
    );
  }
  /**
   * Transforms a value received from Dataverse into a Date object or null.
   * If the value is null, it returns null. Otherwise, it creates a new Date object from the Dataverse value.
   *
   * @param value The value received from Dataverse.
   * @returns A Date object or null.
   */
  transformValueFromDataverse(value) {
    if (value === null) return null;
    return parseDateOnly(value);
  }
  transformValueToDataverse(value) {
    return toDateOnly(value);
  }
}
function dateOnly(name) {
  return new DateOnlyProperty(name);
}
function parseDateOnly(dateString) {
  const [year, month, day] = dateString.slice(0, 10).split("-").map(Number);
  return new Date(year ?? 0, (month ?? 0) - 1, day);
}
function toDateOnly(date) {
  try {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (e) {
    return null;
  }
}

class LookupProperty extends Schema {
  /**
   * The kind of schema element for an expand property, which is "navigation".
   */
  kind = "navigation";
  /**
   * The type of the property, which is "expand".
   */
  type = "lookup";
  /**
   * A function that returns the Table definition for the related record.
   */
  #getTable;
  /**
   * Creates a new ExpandProperty instance.
   *
   * @param name The name of the expand property.
   * @param getTable A function that, when called, returns the Table definition for the related record. This is used to avoid circular dependencies.
   */
  constructor(name, getTable) {
    super(name, null);
    this.#getTable = getTable;
  }
  #table;
  get table() {
    return this.#table ??= this.#getTable();
  }
  /**
   * Transforms a value received from Dataverse into a transformed related record or null.
   * It uses the `transformValueFromDataverse` method of the related Table to transform the data. If the value is null or undefined, it returns null.
   *
   * @param value The raw data representing the related record from Dataverse.
   * @returns The transformed related record of type `Infer<TProperties>` or null.
   */
  transformValueFromDataverse(value) {
    return value == null ? null : this.table.transformValueFromDataverse(value);
  }
  getIssues(value, path) {
    const issues = super.getIssues(value, path);
    if (value !== null) {
      issues.push(...this.table.getIssues(value, path));
    }
    return issues;
  }
}
function lookup(name, getTable) {
  return new LookupProperty(name, getTable);
}

class FormattedProperty extends Schema {
  /**
   * The kind of schema element for a string property, which is "value".
   */
  kind = "value";
  /**
   * The type of the property, which is "string".
   */
  type = "formatted";
  /**
   * Creates a new StringProperty instance.
   *
   * @param name The name of the string property.
   */
  constructor(name) {
    super(`${name}@OData.Community.Display.V1.FormattedValue`, null);
    this.setReadOnly(true);
  }
}
function formatted(name) {
  return new FormattedProperty(name);
}

function isTypeOrNull(type) {
  return (v) => {
    if (v === null) return;
    if (typeof v !== type) {
      return "Not of type " + type;
    }
  };
}

class ImageProperty extends Schema {
  /**
   * The kind of schema element for an image property, which is "value".
   */
  kind = "value";
  /**
   * The type of the property, which is "image".
   */
  type = "image";
  /**
   * Creates a new ImageProperty instance.
   *
   * @param name The name of the image property.
   */
  constructor(name) {
    super(name, null);
    this.check(isTypeOrNull("string"));
  }
}
function image(name) {
  return new ImageProperty(name);
}

class ListProperty extends Schema {
  /**
   * The kind of schema element for a list property, which is "value".
   */
  kind = "value";
  /**
   * The type of the property, which is "list".
   */
  type = "list";
  /**
   * The array of valid values for this list property.
   */
  list;
  /**
   * Creates a new ListProperty instance.
   *
   * @param name The name of the list property.
   * @param list An array of valid string or number values for this property.
   */
  constructor(name, list2) {
    super(name, null);
    this.list = list2;
    this.check((v) => {
      if (v !== null && !list2.includes(v)) {
        return `${v} not in [${list2}]`;
      }
    });
  }
}
function list(name, list2) {
  return new ListProperty(name, list2);
}

function groupby(values, aggregations) {
  return `groupby((${values.filter(isNonEmptyString).join(",")})${aggregations ? "," + aggregations : ""})`;
}
function aggregate(...values) {
  return `aggregate(${values.filter(isNonEmptyString).join(",")})`;
}
function average(name, alias = name) {
  return `${name} with average as ${alias}`;
}
function sum(name, alias = name) {
  return `${name} with sum as ${alias}`;
}
function min(name, alias = name) {
  return `${name} with min as ${alias}`;
}
function max(name, alias = name) {
  return `${name} with max as ${alias}`;
}
function count(alias = "count") {
  return `$count as ${alias}`;
}

function and(...conditions) {
  const validConditions = conditions.filter(isNonEmptyString);
  if (validConditions.length === 0) return "";
  return `(${validConditions.join(" and ")})`;
}
function or(...conditions) {
  const validConditions = conditions.filter(isNonEmptyString);
  if (validConditions.length === 0) return "";
  return `(${validConditions.join(" or ")})`;
}
function not(condition) {
  return isNonEmptyString(condition) ? `not(${condition})` : "";
}
function contains(name, value) {
  return `contains(${name},${wrapString(value)})`;
}
function startsWith(name, value) {
  return `startswith(${name},${wrapString(value)})`;
}
function endsWith(name, value) {
  return `endswith(${name},${wrapString(value)})`;
}
function equals(name, value) {
  return `(${name} eq ${wrapString(value)})`;
}
function notEquals(name, value) {
  return `(${name} ne ${wrapString(value)})`;
}
function greaterThan(name, value) {
  return `(${name} gt ${wrapString(value)})`;
}
function greaterThanOrEqual(name, value) {
  return `(${name} ge ${wrapString(value)})`;
}
function lessThan(name, value) {
  return `(${name} lt ${wrapString(value)})`;
}
function lessThanOrEqual(name, value) {
  return `(${name} le ${wrapString(value)})`;
}
function isActive() {
  return "statecode eq 0";
}
function isInactive() {
  return "statecode eq 1";
}
function isNull(name) {
  return `${name} eq null`;
}
function isNotNull(name) {
  return `${name} ne null`;
}

function Above(name, value) {
  return `Microsoft.Dynamics.CRM.Above(PropertyName=${wrapString(name)},PropertyValue=${wrapString(value)})`;
}

function AboveOrEqual(name, value) {
  return `Microsoft.Dynamics.CRM.AboveOrEqual(PropertyName=${wrapString(name)},PropertyValue=${wrapString(value)})`;
}

function Between(name, value1, value2) {
  return `Microsoft.Dynamics.CRM.Between(PropertyName=${wrapString(name)},PropertyValues=[${wrapString(value1)},${wrapString(
    value2
  )}])`;
}

function Contains(name, value) {
  return `Microsoft.Dynamics.CRM.Contains(PropertyName=${wrapString(name)},PropertyValue=${wrapString(value)})`;
}

function ContainsValues(name, ...values) {
  return `Microsoft.Dynamics.CRM.ContainsValues(PropertyName=${wrapString(name)},PropertyValues=[${values.map(wrapString).join(",")}])`;
}

function DoesNotContainValues(name, ...values) {
  return `Microsoft.Dynamics.CRM.DoesNotContainValues(PropertyName=${wrapString(name)},PropertyValues=[${values.map(wrapString).join(",")}])`;
}

function EqualBusinessId(name) {
  return `Microsoft.Dynamics.CRM.EqualBusinessId(PropertyName=${wrapString(name)})`;
}

function EqualRoleBusinessId(name) {
  return `Microsoft.Dynamics.CRM.EqualRoleBusinessId(PropertyName=${wrapString(name)})`;
}

function EqualUserId(name) {
  return `Microsoft.Dynamics.CRM.EqualUserId(PropertyName=${wrapString(name)})`;
}

function EqualUserLanguage(name) {
  return `Microsoft.Dynamics.CRM.EqualUserLanguage(PropertyName=${wrapString(name)})`;
}

function EqualUserOrUserHierarchy(name) {
  return `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchy(PropertyName=${wrapString(name)})`;
}

function EqualUserOrUserHierarchyAndTeams(name) {
  return `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchyAndTeams(PropertyName=${wrapString(name)})`;
}

function EqualUserOrUserTeams(name) {
  return `Microsoft.Dynamics.CRM.EqualUserOrUserTeams(PropertyName=${wrapString(name)})`;
}

function EqualUserTeams(name) {
  return `Microsoft.Dynamics.CRM.EqualUserTeams(PropertyName=${wrapString(name)})`;
}

function In(name, ...values) {
  return `Microsoft.Dynamics.CRM.In(PropertyName=${wrapString(name)},PropertyValues=[${values.map(wrapString).join(",")}])`;
}

function InFiscalPeriod(name, value) {
  return `Microsoft.Dynamics.CRM.InFiscalPeriod(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function InFiscalPeriodAndYear(name, fiscalPeriod, fiscalYear) {
  return `Microsoft.Dynamics.CRM.InFiscalPeriodAndYear(PropertyName=${wrapString(name)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
}

function InFiscalYear(name, value) {
  return `Microsoft.Dynamics.CRM.InFiscalYear(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function InOrAfterFiscalPeriodAndYear(name, fiscalPeriod, fiscalYear) {
  return `Microsoft.Dynamics.CRM.InOrAfterFiscalPeriodAndYear(PropertyName=${wrapString(name)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
}

function InOrBeforeFiscalPeriodAndYear(name, fiscalPeriod, fiscalYear) {
  return `Microsoft.Dynamics.CRM.InOrBeforeFiscalPeriodAndYear(PropertyName=${wrapString(name)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
}

function Last7Days(name) {
  return `Microsoft.Dynamics.CRM.Last7Days(PropertyName=${wrapString(name)})`;
}

function LastFiscalPeriod(name) {
  return `Microsoft.Dynamics.CRM.LastFiscalPeriod(PropertyName=${wrapString(name)})`;
}

function LastFiscalYear(name) {
  return `Microsoft.Dynamics.CRM.LastFiscalYear(PropertyName=${wrapString(name)})`;
}

function LastMonth(name) {
  return `Microsoft.Dynamics.CRM.LastMonth(PropertyName=${wrapString(name)})`;
}

function LastWeek(name) {
  return `Microsoft.Dynamics.CRM.LastWeek(PropertyName=${wrapString(name)})`;
}

function LastXDays(name, value) {
  return `Microsoft.Dynamics.CRM.LastXDays(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function LastXFiscalPeriods(name, value) {
  return `Microsoft.Dynamics.CRM.LastXFiscalPeriods(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function LastXFiscalYears(name, value) {
  return `Microsoft.Dynamics.CRM.LastXFiscalYears(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function LastXHours(name, value) {
  return `Microsoft.Dynamics.CRM.LastXHours(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function LastXMonths(name, value) {
  return `Microsoft.Dynamics.CRM.LastXMonths(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function LastXWeeks(name, value) {
  return `Microsoft.Dynamics.CRM.LastXWeeks(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function LastXYears(name, value) {
  return `Microsoft.Dynamics.CRM.LastXYears(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function LastYear(name) {
  return `Microsoft.Dynamics.CRM.LastYear(PropertyName=${wrapString(name)})`;
}

function Next7Days(name) {
  return `Microsoft.Dynamics.CRM.Next7Days(PropertyName=${wrapString(name)})`;
}

function NextFiscalPeriod(name) {
  return `Microsoft.Dynamics.CRM.NextFiscalPeriod(PropertyName=${wrapString(name)})`;
}

function NextFiscalYear(name) {
  return `Microsoft.Dynamics.CRM.NextFiscalYear(PropertyName=${wrapString(name)})`;
}

function NextMonth(name) {
  return `Microsoft.Dynamics.CRM.NextMonth(PropertyName=${wrapString(name)})`;
}

function NextWeek(name) {
  return `Microsoft.Dynamics.CRM.NextWeek(PropertyName=${wrapString(name)})`;
}

function NextXDays(name, value) {
  return `Microsoft.Dynamics.CRM.NextXDays(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function NextXFiscalPeriods(name, value) {
  return `Microsoft.Dynamics.CRM.NextXFiscalPeriods(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function NextXFiscalYears(name, value) {
  return `Microsoft.Dynamics.CRM.NextXFiscalYears(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function NextXHours(name, value) {
  return `Microsoft.Dynamics.CRM.NextXHours(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function NextXMonths(name, value) {
  return `Microsoft.Dynamics.CRM.NextXMonths(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function NextXWeeks(name, value) {
  return `Microsoft.Dynamics.CRM.NextXWeeks(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function NextXYears(name, value) {
  return `Microsoft.Dynamics.CRM.NextXYears(PropertyName=${wrapString(name)},PropertyValue=${value})`;
}

function NextYear(name) {
  return `Microsoft.Dynamics.CRM.NextYear(PropertyName=${wrapString(name)})`;
}

function NotBetween(name, value1, value2) {
  return `Microsoft.Dynamics.CRM.NotBetween(PropertyName=${wrapString(name)},PropertyValues=[${wrapString(
    value1
  )},${wrapString(value2)}])`;
}

function NotEqualBusinessId(name) {
  return `Microsoft.Dynamics.CRM.NotEqualBusinessId(PropertyName=${wrapString(name)})`;
}

function NotEqualUserId(name) {
  return `Microsoft.Dynamics.CRM.NotEqualUserId(PropertyName=${wrapString(name)})`;
}

function NotIn(name, ...values) {
  return `Microsoft.Dynamics.CRM.NotIn(PropertyName=${wrapString(name)},PropertyValues=[${values.map(wrapString).join(",")}])`;
}

function NotUnder(name, value) {
  return `Microsoft.Dynamics.CRM.NotUnder(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function OlderThanXDays(name, value) {
  return `Microsoft.Dynamics.CRM.OlderThanXDays(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function OlderThanXHours(name, value) {
  return `Microsoft.Dynamics.CRM.OlderThanXHours(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function OlderThanXMinutes(name, value) {
  return `Microsoft.Dynamics.CRM.OlderThanXMinutes(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function OlderThanXMonths(name, value) {
  return `Microsoft.Dynamics.CRM.OlderThanXMonths(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function OlderThanXWeeks(name, value) {
  return `Microsoft.Dynamics.CRM.OlderThanXWeeks(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function OlderThanXYears(name, value) {
  return `Microsoft.Dynamics.CRM.OlderThanXYears(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function On(name, value) {
  return `Microsoft.Dynamics.CRM.On(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function OnOrAfter(name, value) {
  return `Microsoft.Dynamics.CRM.OnOrAfter(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function OnOrBefore(name, value) {
  return `Microsoft.Dynamics.CRM.OnOrBefore(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function ThisFiscalPeriod(name) {
  return `Microsoft.Dynamics.CRM.ThisFiscalPeriod(PropertyName=${wrapString(name)})`;
}

function ThisFiscalYear(name) {
  return `Microsoft.Dynamics.CRM.ThisFiscalYear(PropertyName=${wrapString(name)})`;
}

function ThisMonth(name) {
  return `Microsoft.Dynamics.CRM.ThisMonth(PropertyName=${wrapString(name)})`;
}

function ThisWeek(name) {
  return `Microsoft.Dynamics.CRM.ThisWeek(PropertyName=${wrapString(name)})`;
}

function ThisYear(name) {
  return `Microsoft.Dynamics.CRM.ThisYear(PropertyName=${wrapString(name)})`;
}

function Today(name) {
  return `Microsoft.Dynamics.CRM.Today(PropertyName=${wrapString(name)})`;
}

function Tomorrow(name) {
  return `Microsoft.Dynamics.CRM.Tomorrow(PropertyName=${wrapString(name)})`;
}

function Under(name, value) {
  return `Microsoft.Dynamics.CRM.Under(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function UnderOrEqual(name, value) {
  return `Microsoft.Dynamics.CRM.UnderOrEqual(PropertyName=${wrapString(name)},PropertyValue=${wrapString(
    value
  )})`;
}

function Yesterday(name) {
  return `Microsoft.Dynamics.CRM.Yesterday(PropertyName=${wrapString(name)})`;
}

function query(query2) {
  const params = new URLSearchParams();
  if (query2?.select) params.set("$select", query2.select);
  if (query2?.expand) params.set("$expand", query2.expand);
  if (query2?.orderby) params.set("$orderby", query2.orderby);
  if (query2?.filter) params.set("$filter", query2.filter);
  if (query2?.top) params.set("$top", query2.top.toFixed(0));
  if (query2?.apply) params.set("$apply", query2.apply);
  return params.toString();
}
function keys(keys2) {
  return Object.entries(keys2).filter((kv) => isNonEmptyString(kv[1])).map(([k, v]) => `${k}=${wrapString(v)}`).join(",");
}
function select(...values) {
  return values.filter(isNonEmptyString).join(",");
}
function expand(values) {
  if (typeof values === "string") return values;
  return Object.entries(values).map(
    ([name, v]) => typeof v === "string" ? v : `${name}(${v.select ? `$select=${select(...Array.isArray(v.select) ? v.select : [v.select])};` : ""}${v.expand ? `$expand=${expand(v.expand)}` : ""})`
  ).join(",");
}
function orderby(values) {
  return Object.entries(values).filter((kv) => isNonEmptyString(kv[1])).map(([k, v]) => `${k} ${v}`).join(",");
}

class Table extends Schema {
  properties;
  kind = "table";
  type = "table";
  /**
   * Creates a new Table instance.
   *
   * @param entitySetName The entity set name of the Dataverse table.
   * @param props An object defining the properties of the table.
   */
  constructor(entitySetName, props) {
    super(entitySetName, null);
    this.name = entitySetName;
    this.properties = props;
  }
  getIssues(value, path = []) {
    const issues = super.getIssues(value, path);
    if (typeof value !== "object") value = {};
    for (const [key, property] of Object.entries(this.properties)) {
      if (!property.getReadOnly())
        issues.push(...property.getIssues(value[key], [...path, key]));
    }
    return issues;
  }
  /**
   * Gets the default values for the table's properties, optionally merged with provided values.
   *
   * @param value Optional object containing values to merge with the defaults.
   * @returns An object containing the default values for the table.
   *
   * @example
   * // Example 1: Get all default values.
   * const defaultAccount = myAccountTable.getDefault();
   * // Returns an object with all properties set to their defaults.
   *
   * // Example 2: Merge provided values with defaults.
   * const partialAccount = { name: "Initial Name" };
   * const mergedAccount = myAccountTable.getDefault(partialAccount);
   * // Returns an object with defaults, but 'name' is set to "Initial Name".
   */
  getDefault(value) {
    const result = {};
    for (const [key, property] of Object.entries(this.properties)) {
      if (value === void 0 || !(key in value)) {
        result[key] = property.getDefault();
      } else {
        result[key] = value[key];
      }
    }
    return result;
  }
  /**
   * Retrieves a single record from the table by its ID.
   *
   * @param keys The unique identifier of the record to retrieve.
   * @returns A promise that resolves to the retrieved record, or null if not found.
   *
   * @example
   * const account = await myAccountTable.getRecord("12345678-90ab-cdef-1234-567890abcdef");
   * if (account) {
   * console.log(account.name); // Access a property of the record
   * }
   */
  async getRecord(id) {
    return getRecord(this.name, id, buildQuery(this)).then(
      (v) => this.transformValueFromDataverse(v)
    );
  }
  getAlternateKeys(value) {
    return Object.entries(value).map((kv) => `${this.properties[kv[0]].name}=${kv[1]}`).join(",");
  }
  /**
   * Retrieves multiple records from the table, optionally with a query.
   *
   * @param query An optional object specifying query parameters such as order, filter, and top.
   * @returns A promise that resolves to an array of retrieved records.
   *
   * @example
   * // Example 1: Get all accounts
   * const allAccounts = await myAccountTable.getRecords();
   *
   * // Example 2: Get accounts ordered by name, with a limit
   * const limitedAccounts = await myAccountTable.getRecords({
   * orderby: { name: "asc" },
   * top: 10,
   * });
   *
   * // Example 3: Get accounts filtered by a condition
   * const filteredAccounts = await myAccountTable.getRecords({
   * filter: equals("accountnumber", "123")
   * });
   */
  async getRecords(query2) {
    return getRecords(this.name, buildQuery(this, query2)).then(
      (values) => values.map((v) => this.transformValueFromDataverse(v))
    );
  }
  /**
   * Retrieves the value of a specific property for a record.
   *
   * @param key The key of the property to retrieve.
   * @param id The unique identifier of the record.
   * @param query Optional query parameters to apply.
   * @returns A promise that resolves to the property value.
   *
   * @example
   * //Get a single property
   * const accountName = await myAccountTable.getPropertyValue("name", "12345678-90ab-cdef-1234-567890abcdef");
   *
   * //Get a collection valued property
   * const contacts = await myAccountTable.getPropertyValue("contact_customer_accounts", "12345678-90ab-cdef-1234-567890abcdef");
   */
  async getPropertyValue(key, id, query2) {
    const prop = this.properties[key];
    if (prop.kind === "value" || prop.type === "lookupId") {
      return getPropertyValue(this.name, id, prop.name).then(
        (v) => prop.transformValueFromDataverse(v)
      );
    }
    if (prop.type === "collection" || prop.type === "collectionIds") {
      return getAssociatedRecords(
        this.name,
        id,
        prop.name,
        buildQuery(this, query2)
      ).then(
        (v) => prop.transformValueFromDataverse(v)
      );
    }
    if (prop.type === "lookup") {
      return getAssociatedRecord(
        this.name,
        id,
        prop.name,
        buildQuery(this, query2)
      ).then(
        (v) => prop.transformValueFromDataverse(v)
      );
    }
    throw new Error("Invalid Property");
  }
  /**
   * Updates the value of a specific property for a record.
   *
   * @param key The key of the property to update.
   * @param id The unique identifier of the record to update.
   * @param value The new value for the property.
   * @returns A promise that resolves to the ID of the updated record.
   *
   * @example
   * await myAccountTable.updatePropertyValue("name", "12345678-90ab-cdef-1234-567890abcdef", "New Name");
   */
  async updatePropertyValue(key, id, value) {
    const prop = this.properties[key];
    if (prop.kind === "navigation") {
      await this.updateNavigationProperty(prop, id, value);
    } else {
      await updatePropertyValue(
        this.name,
        id,
        this.properties[key].name,
        prop.transformValueToDataverse(value)
      );
    }
    return id;
  }
  /**
   * Handles updating navigation properties (lookups, expands, collections, lookups).
   * @param property The navigation property to update
   * @param id The id of the record being updated.
   * @param value The new value for the navigation property.
   */
  async updateNavigationProperty(property, id, value) {
    if (property.type === "collection" || property.type === "collectionIds") {
      if (Array.isArray(value)) {
        const ids = property.type === "collection" ? await Promise.all(
          value.map((v) => property.table.saveRecord(v))
        ) : value;
        return associateRecordToList(
          this.name,
          id,
          property.name,
          property.table.name,
          property.table.getPrimaryKey().property.name,
          ids
        );
      }
    }
    if (property.type === "lookup" || property.type == "lookupId") {
      const name = property.type === "lookup" ? property.name : property.navigationName;
      if (value === null) {
        return disssociateRecord(this.name, id, name);
      } else {
        const childId = property.type === "lookup" ? await this.saveRecord(value) : value;
        return associateRecord(
          this.name,
          id,
          name,
          property.table.name,
          childId
        );
      }
    }
  }
  /**
   * Associates a child record with a parent record through a navigation property.
   *
   * @param key The key of the navigation property to use for the association.
   * @param id The unique identifier of the parent record.
   * @param childId The unique identifier of the child record to associate.
   * @returns A promise that resolves to the ID of the parent record.
   *
   * @example
   * const accountId = "a1b2c3d4-e5f6-7890-1234-567890abcdef";
   * const contactId = "f9e8d7c6-b5a4-3210-fedc-ba9876543210";
   * await myAccountTable.associateRecord("primarycontactid", accountId, contactId);
   */
  async associateRecord(key, id, childId) {
    const prop = this.properties[key];
    if (prop.kind === "navigation") {
      return associateRecord(
        this.name,
        id,
        prop.name,
        prop.table.name,
        childId
      );
    } else {
      throw new Error("Can only associate to naigation properties");
    }
  }
  async dissociateRecord(key, id, childId) {
    const prop = this.properties[key];
    if (prop.kind === "navigation") {
      return disssociateRecord(
        this.name,
        id,
        prop.name,
        prop.type === "collection" || prop.type === "collectionIds" ? childId : void 0
      );
    } else {
      throw new Error("Can only associate to naigation properties");
    }
  }
  /**
   * Saves a record to the table.  Handles both creating new records and updating existing ones.
   *
   * @param value An object containing the data to save.  The object structure should match the table's properties.
   * @returns A promise that resolves to the GUID of the saved record.
   *
   * @example
   * // Example 1: Creating a new account
   * const newAccountId = await myAccountTable.saveRecord({
   * name: "New Account Name",
   * accountnumber: "NewAccount001",
   * });
   *
   * // Example 2: Updating an existing account
   * const existingAccountId = "a1b2c3d4-e5f6-7890-1234-567890abcdef";
   * const updatedAccountId = await myAccountTable.saveRecord({
   * id: existingAccountId,
   * name: "Updated Account Name",
   * });
   */
  async saveRecord(value) {
    const promises = [];
    const pk = this.getPrimaryKey().property.name;
    let id = this.getPrimaryId(value);
    if (id) {
      promises.push(
        patchRecord(
          this.name,
          id,
          this.transformValueToDataverse(value),
          query({ select: pk })
        )
      );
    } else {
      const record = await postRecord(
        this.name,
        this.transformValueToDataverse(value),
        query({ select: pk })
      );
      id = record[pk];
    }
    for (const [key, property] of Object.entries(this.properties)) {
      if (property.getReadOnly() || !(key in value)) continue;
      if (property.kind === "navigation") {
        promises.push(this.updateNavigationProperty(property, id, value[key]));
      }
    }
    await Promise.all(promises);
    return id;
  }
  /**
   * Deletes a record from the table by its ID.
   *
   * @param id The unique identifier of the record to delete.
   * @returns A promise that resolves to the ID of the deleted record.
   *
   * @example
   * await myAccountTable.deleteRecord("12345678-90ab-cdef-1234-567890abcdef");
   */
  async deleteRecord(id) {
    return deleteRecord(this.name, id);
  }
  /**
   * Deletes the value of a specific property for a record.  Only works for value properties.
   *
   * @param key The key of the property to delete the value of.
   * @param id The unique identifier of the record.
   * @returns A promise that resolves to the ID of the record.
   *
   * @example
   * await myAccountTable.deletePropertyValue("accountnumber", "12345678-90ab-cdef-1234-567890abcdef");
   */
  async deletePropertyValue(key, id) {
    const prop = this.properties[key];
    if (prop.kind === "value") {
      return deletePropertyValue(this.name, id, prop.name);
    }
    throw new Error("Cannot delete navigation property values");
  }
  /**
   * Gets the primary key property of the table.
   *
   * @returns An object containing the key and property definition of the primary key.
   * @throws Error if no primary key is found.
   *
   * @example
   * const primaryKeyInfo = myAccountTable.getPrimaryKey();
   * console.log(primaryKeyInfo.key); // "id" (or whatever the primary key property is named)
   * console.log(primaryKeyInfo.property); // The PrimaryKeyProperty object
   */
  getPrimaryKey() {
    const result = Object.entries(this.properties).find(
      (f) => f[1].type === "primaryKey"
    );
    if (!result) throw new Error("No Primary Key");
    return {
      key: result[0],
      property: result[1]
    };
  }
  /**
   * Gets the primary key value from a record object.
   *
   * @param value An object representing a record, typically of type `Partial<Infer<TProperties>>`.
   * @returns The GUID of the primary key, or undefined if not found in the provided value.
   *
   * @example
   * const accountData = { id: "a1b2c3d4-e5f6-7890-1234-567890abcdef", name: "My Account" };
   * const accountId = myAccountTable.getPrimaryId(accountData); // returns "a1b2c3d4-e5f6-7890-1234-567890abcdef"
   */
  getPrimaryId(value) {
    const { key } = this.getPrimaryKey();
    return value[key];
  }
  /**
   * Transforms a record from Dataverse format to the format expected by the application.
   * This involves using the `transformValueFromDataverse` method of each property.
   *
   * @param value The record data in Dataverse format.
   * @returns The transformed record data in the application's format.
   *
   * @example
   * // Assuming Dataverse returns: { accountid: "...", name: "Account Name", ... }
   * const transformedAccount = myAccountTable.transformValueFromDataverse(dataverseAccountData);
   * // transformedAccount might look like: { id: "...", name: "Account Name", ... }
   */
  transformValueFromDataverse(value) {
    if (value === null) return null;
    const result = {};
    for (const [key, property] of Object.entries(this.properties)) {
      result[key] = property.transformValueFromDataverse(value[property.name]);
    }
    result[Etag] = value[Etag];
    return result;
  }
  /**
   * Transforms a record from the application's format to Dataverse format.
   * This involves using the `transformValueToDataverse` method of each property.
   *
   * @param value The record data in the application's format.
   * @returns The record data in Dataverse format.
   *
   * @example
   * const appAccountData = { id: "...", name: "Account Name", ... };
   * const dataverseAccountData = myAccountTable.transformValueToDataverse(appAccountData);
   * // dataverseAccountData might look like: { accountid: "...", name: "Account Name", ... }
   */
  transformValueToDataverse(value) {
    if (value === null) return null;
    const result = {};
    for (const [key, property] of Object.entries(this.properties)) {
      if (property.getReadOnly() || !(key in value)) continue;
      if (property.kind === "value") {
        const v = property.transformValueToDataverse(value[key]);
        result[property.name] = v;
      }
    }
    return result;
  }
  /**
   * Creates a new Table instance with a subset of the original table's properties.
   *
   * @param keys The keys of the properties to include in the new table.
   * @returns A new Table instance with the specified properties.
   *
   * @example
   * // Create a new table with only 'name' and 'accountnumber' properties.
   * const nameAndNumberTable = myAccountTable.pickProperties("name", "accountnumber");
   */
  pickProperties(...keys) {
    const properties = Object.fromEntries(
      Object.entries(this.properties).filter((v) => keys.includes(v[0]))
    );
    return new Table(this.name, properties);
  }
  /**
   * Creates a new Table instance with all but the specified properties from the original table.
   *
   * @param keys The keys of the properties to exclude from the new table.
   * @returns A new Table instance with the remaining properties.
   *
   * @example
   * // Create a new table without the 'notes' and 'tasks' properties.
   * const noNotesAndTasksTable = myAccountTable.omitProperties("notes", "tasks");
   */
  omitProperties(...keys) {
    const properties = Object.fromEntries(
      Object.entries(this.properties).filter((v) => !keys.includes(v[0]))
    );
    return new Table(this.name, properties);
  }
  /**
   * Creates a new Table instance with additional properties added to the original table's properties.
   *
   * @param properties An object defining the properties to append.
   * @returns A new Table instance with the appended properties.
   *
   * @example
   * // Create a new table with an added 'customField' property.
   * const extendedTable = myAccountTable.appendProperties({
   * customField: string("custom_field"),
   * });
   */
  appendProperties(properties) {
    return new Table(this.name, { ...this.properties, ...properties });
  }
  /**
   * Use for typescript only. const x: typeof table.T
   */
  T;
}
function table(name, properties) {
  return new Table(name, properties);
}
function buildQuery(table2, q) {
  return query({
    top: q?.top,
    filter: q?.filter,
    orderby: q?.orderby ? Object.entries(q?.orderby ?? {}).map(([key, value]) => `${table2.properties[key].name} ${value}`).join(",") : void 0,
    select: buildSelect(table2),
    expand: buildExpand(table2)
  });
}
function buildSelect(table2) {
  return Object.values(table2.properties).filter((v) => v.kind === "value" || v.type === "lookupId").map((v) => v.name).join(",");
}
function buildExpand(table2) {
  return Object.values(table2.properties).filter((v) => v.kind === "navigation" && v.type !== "lookupId").map(
    (v) => `${v.name}($select=${buildSelect(v.table)};$expand=${buildExpand(
      v.table
    )})`
  ).join(",");
}

class LookupIdProperty extends Schema {
  /**
   * The kind of schema element for a lookup property, which is "navigation".
   */
  kind = "navigation";
  /**
   * The type of the property, which is "lookup".
   */
  type = "lookupId";
  /**
   * The logical name of the navigation property in the Dataverse entity.
   */
  navigationName;
  /**
   * A function that returns the Table definition for the related record.
   */
  #getTable;
  /**
   * Creates a new LookupProperty instance.
   * The internal name of the property in Dataverse will be `_${name.toLowerCase()}_value`.
   *
   * @param name The logical name of the navigation property.
   * @param getTable A function that, when called, returns the Table definition for the related entity. This is used to avoid circular dependencies.
   */
  constructor(name, getTable) {
    super(`_${name.toLowerCase()}_value`, null);
    this.navigationName = name;
    this.#getTable = getTable;
  }
  #table;
  get table() {
    if (!this.#table) {
      const table = this.#getTable();
      const { property } = table.getPrimaryKey();
      this.#table = new Table(table.name, { id: property });
    }
    return this.#table;
  }
  /**
   * Transforms the property's value (a GUID) into a format suitable for sending to Dataverse for association.
   * If a value (GUID) is provided, it formats it as `entitySetName(value)`. If the value is null, it returns null.
   *
   * @param value The GUID of the related record.
   * @returns A string in the format `entitySetName(guid)` or null.
   */
  transformValueToDataverse(value) {
    if (value) {
      return `${this.table.name}(${value})`;
    } else {
      return null;
    }
  }
}
function lookupId(name, getTable) {
  return new LookupIdProperty(name, getTable);
}

class CollectionIdsProperty extends Schema {
  /**
   * The kind of schema element for a collection of lookups property, which is "navigation".
   */
  kind = "navigation";
  /**
   * The type of the property, which is "lookups".
   */
  type = "collectionIds";
  /**
   * A function that returns the Table definition for the related records.
   */
  #getTable;
  /**
   * Creates a new LookupsProperty instance.
   *
   * @param name The name of the collection of lookup properties.
   * @param getTable A function that, when called, returns the Table definition for the related entity. This is used to avoid circular dependencies.
   */
  constructor(name, getTable) {
    super(name, []);
    this.#getTable = getTable;
    this.check(
      (v) => !Array.isArray(v) ? "value is not an array" : void 0
    );
  }
  #table;
  get table() {
    if (!this.#table) {
      const table = this.#getTable();
      const { property } = table.getPrimaryKey();
      this.#table = new Table(table.name, { id: property });
    }
    return this.#table;
  }
  /**
   * Transforms an array of values received from Dataverse into an array of GUIDs of the related records.
   * It iterates over the input array and extracts the value of the primary key property ('id') from each related record.
   *
   * @param value An array of raw data representing the related records from Dataverse.
   * @returns An array of GUIDs of the related records.
   */
  transformValueFromDataverse(value) {
    return Array.from(value).map((v) => v[this.table.properties.id.name]);
  }
  getIssues(value, path = []) {
    const issues = super.getIssues(value, path);
    if (Array.isArray(value)) {
      issues.push(
        ...value.map((v, i) => this.table.getIssues(v, [...path, i])).flat(1)
      );
    }
    return issues;
  }
}
function collectionIds(name, getTable) {
  return new CollectionIdsProperty(name, getTable);
}

class NumberProperty extends Schema {
  /**
   * The kind of schema element for a number property, which is "value".
   */
  kind = "value";
  /**
   * The type of the property, which is "number".
   */
  type = "number";
  /**
   * Creates a new NumberProperty instance.
   *
   * @param name The name of the number property.
   */
  constructor(name) {
    super(name, null);
    this.check(isTypeOrNull("number"));
  }
}
function number(name) {
  return new NumberProperty(name);
}

class PrimaryKeyProperty extends Schema {
  /**
   * The kind of schema element for a primary key property, which is "value".
   */
  kind = "value";
  /**
   * The type of the property, which is "primaryKey".
   */
  type = "primaryKey";
  /**
   * Creates a new PrimaryKeyProperty instance.
   * Sets the property to read-only upon creation.
   *
   * @param name The name of the primary key property (typically the logical name of the primary key attribute).
   */
  constructor(name) {
    super(name, "");
    this.setReadOnly();
    this.check(isType("string"));
  }
}
function primaryKey(name) {
  return new PrimaryKeyProperty(name);
}

class StringProperty extends Schema {
  /**
   * The kind of schema element for a string property, which is "value".
   */
  kind = "value";
  /**
   * The type of the property, which is "string".
   */
  type = "string";
  /**
   * Creates a new StringProperty instance.
   *
   * @param name The name of the string property.
   */
  constructor(name) {
    super(name, null);
    this.check(isTypeOrNull("string"));
  }
}
function string(name) {
  return new StringProperty(name);
}

function email() {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return (v) => {
    if (v && !emailRegex.test(v)) {
      return "Invalid email format";
    }
  };
}

function integer() {
  return (v) => {
    if (v !== void 0 && v !== null) {
      const num = Number(v);
      if (isNaN(num) || !Number.isInteger(num)) {
        return "Must be an integer";
      }
    }
  };
}

function maxLength(max) {
  return (v) => {
    if (v.length > max) return `Length more than ${max}`;
  };
}

function maxValue(max) {
  return (v) => {
    if (typeof v === "number" && v > max) {
      return `Must be no more than ${max}`;
    }
  };
}

function minLength(min) {
  return (v) => {
    if (v.length < min) return `Length less than ${min}`;
  };
}

function minValue(min) {
  return (v) => {
    if (typeof v === "number" && v < min) {
      return `Must be at least ${min}`;
    }
  };
}

function numeric() {
  return (v) => {
    if (v !== void 0 && v !== null) {
      const num = Number(v);
      if (isNaN(num)) {
        return "Must be a number";
      }
    }
  };
}

function pattern(regex, message) {
  return (v) => {
    if (v && !regex.test(v)) {
      return message || "Invalid format";
    }
  };
}

export { Above, AboveOrEqual, Between, BooleanProperty, CollectionIdsProperty, CollectionProperty, Contains, ContainsValues, DateOnlyProperty, DateProperty, DoesNotContainValues, EqualBusinessId, EqualRoleBusinessId, EqualUserId, EqualUserLanguage, EqualUserOrUserHierarchy, EqualUserOrUserHierarchyAndTeams, EqualUserOrUserTeams, EqualUserTeams, Etag, FormattedProperty, ImageProperty, In, InFiscalPeriod, InFiscalPeriodAndYear, InFiscalYear, InOrAfterFiscalPeriodAndYear, InOrBeforeFiscalPeriodAndYear, Last7Days, LastFiscalPeriod, LastFiscalYear, LastMonth, LastWeek, LastXDays, LastXFiscalPeriods, LastXFiscalYears, LastXHours, LastXMonths, LastXWeeks, LastXYears, LastYear, ListProperty, LookupIdProperty, LookupProperty, Next7Days, NextFiscalPeriod, NextFiscalYear, NextMonth, NextWeek, NextXDays, NextXFiscalPeriods, NextXFiscalYears, NextXHours, NextXMonths, NextXWeeks, NextXYears, NextYear, NotBetween, NotEqualBusinessId, NotEqualUserId, NotIn, NotUnder, NumberProperty, OlderThanXDays, OlderThanXHours, OlderThanXMinutes, OlderThanXMonths, OlderThanXWeeks, OlderThanXYears, On, OnOrAfter, OnOrBefore, PrimaryKeyProperty, RetrieveAadUserRoles, RetrieveTotalRecordCount, StringProperty, Table, ThisFiscalPeriod, ThisFiscalYear, ThisMonth, ThisWeek, ThisYear, Today, Tomorrow, Under, UnderOrEqual, WhoAmI, Yesterday, activateRecord, aggregate, and, associateRecord, associateRecordToList, attachEtag, average, base64ImageToURL, boolean, collection, collectionIds, contains, count, date, dateOnly, deactivateRecord, deletePropertyValue, deleteRecord, disssociateRecord, email, endsWith, equals, expand, fetchChoices, fetchXml, formatted, getAssociatedRecord, getAssociatedRecords, getImageUrl, getNextLink, getPropertyRawValue, getPropertyRawValueURL, getPropertyValue, getRecord, getRecords, globalConfig, greaterThan, greaterThanOrEqual, groupby, image, integer, isActive, isInactive, isNonEmptyString, isNotNull, isNull, keys, lessThan, lessThanOrEqual, list, lookup, lookupId, mapChoices, max, maxLength, maxValue, mergeRecords, min, minLength, minValue, not, notEquals, number, numeric, or, orderby, patchRecord, pattern, postRecord, postRecordGetId, primaryKey, query, required, select, setConfig, startsWith, string, sum, table, toBase64, tryFetch, updatePropertyValue, wrapString, xml };
