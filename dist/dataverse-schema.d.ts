/**
 * Generates a query expression for the "Above" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The value to compare.
 * @returns {string} The query expression for the "Above" operator.
 */
export declare function Above(name: string, value: string): string;

/**
 * Generates a query expression for the "AboveOrEqual" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The value to compare.
 * @returns {string} The query expression for the "AboveOrEqual" operator.
 */
export declare function AboveOrEqual(name: string, value: string): string;

/**
 * Activates a record in the specified Dataverse entity set by setting its 'statecode' to 0.
 * Note that the actual attribute name for the state code might vary depending on the entity.
 * This function assumes the standard 'statecode' attribute with a value of 0 representing the active state.
 *
 * @param entitySetName - The logical name of the entity set where the record is located (e.g., 'accounts', 'contacts', 'opportunities').
 * @param id - The unique identifier of the record to activate.
 * @returns A promise that resolves to the ID of the activated record upon successful activation.
 *
 * @example
 * // Activate the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * activateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef')
 * .then(activatedAccountId => console.log('Activated Account ID:', activatedAccountId))
 * .catch(error => console.error('Error activating account:', error));
 *
 * @example
 * // Activate the opportunity record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210'.
 * activateRecord('opportunities', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210')
 * .then(activatedOpportunityId => console.log('Activated Opportunity ID:', activatedOpportunityId))
 * .catch(error => console.error('Error activating opportunity:', error));
 */
export declare function activateRecord(entitySetName: string, id: DataverseKey): Promise<string>;

/**
 * Creates an OData aggregate expression.
 *
 * @param values An array of aggregation expressions (e.g., "price with average as avgPrice"). Empty or null values will be filtered out.
 * @returns An OData aggregate expression string.
 *
 * @example
 * // Aggregate with a single average:
 * aggregate("price with average as avgPrice"); // returns "aggregate(price with average as avgPrice)"
 *
 * // Aggregate with multiple aggregations:
 * aggregate("price with average as avgPrice", "quantity with sum as totalQuantity", "rating with average as avgRating");
 * // returns "aggregate(price with average as avgPrice,quantity with sum as totalQuantity,rating with average as avgRating)"
 */
export declare function aggregate(...values: string[]): string;

/**
 * Represents an alternate key for a Dataverse entity.  An alternate key is used
 * to uniquely identify a record instead of using its primary key (GUID).
 * It can be a single key-value pair or a combination of multiple key-value pairs.
 */
export declare type AlternateKey = `${string}=${string}` | `${string}=${string},${string}=${string}`;

/**
 * Combines multiple OData filter conditions with the "and" operator.
 * Filters out any null or undefined conditions.
 *
 * @param conditions An array of OData filter conditions (strings), which can be null or undefined.
 * @returns A string representing the combined conditions, or an empty string if no valid conditions are provided.
 *
 * @example
 * // Example 1: Combining equals and greaterThan
 * and(equals("name", "John"), greaterThan("age", 30));
 * // returns "(name eq 'John' and age gt 30)"
 *
 * // Example 2: Combining with contains
 * and(contains("description", "software"), equals("category", "application"));
 * // returns "(contains(description,'software') and category eq 'application')"
 *
 * // Example 3: Handling null/undefined conditions
 * and("name eq 'John'", null, greaterThan("age", 30));
 * // returns "(name eq 'John' and age gt 30)"
 */
export declare function and(...conditions: (string | null | undefined)[]): string;

/**
 * Associates an existing child record with a parent record through a single-valued navigation property in Dataverse.
 *
 * @param entitySetName - The logical name of the parent entity set (e.g., 'accounts').
 * @param parentId - The unique identifier of the parent record.
 * @param propertyName - The name of the single-valued navigation property on the parent entity that points to the child entity (e.g., 'primarycontactid', 'parentaccountid').
 * @param childEntitySetName - The logical name of the child entity set (e.g., 'contacts', 'accounts').
 * @param childId - The unique identifier of the child record to associate.
 * @returns A promise that resolves to the ID of the associated child record upon successful association.
 *
 * @example
 * // Associate the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210' as the primary contact of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * associateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'primarycontactid', 'contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210')
 * .then(associatedContactId => console.log('Associated Contact ID:', associatedContactId))
 * .catch(error => console.error('Error associating contact:', error));
 *
 * @example
 * // Associate the account record with ID 'c7b6a5e4-f3d2-1a90-8765-43210fedcba9' as the parent account of the current account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * associateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'parentaccountid', 'accounts', 'c7b6a5e4-f3d2-1a90-8765-43210fedcba9')
 * .then(associatedAccountId => console.log('Associated Account ID:', associatedAccountId))
 * .catch(error => console.error('Error associating account:', error));
 */
export declare function associateRecord(entitySetName: string, parentId: DataverseKey, propertyName: string, childEntitySetName: string, childId: DataverseKey): Promise<DataverseKey>;

/**
 * Associates a list of child records with a parent record through a collection-valued navigation property in Dataverse.
 * This function adds associations for child records that are not currently associated and removes associations for child records that are currently associated but not in the provided list.
 *
 * @param entitySetName - The logical name of the parent entity set (e.g., 'accounts').
 * @param parentId - The unique identifier of the parent record.
 * @param propertyName - The name of the collection-valued navigation property on the parent entity that points to the child entities (e.g., 'contact_customer_accounts').
 * @param childEntitySetName - The logical name of the child entity set (e.g., 'contacts').
 * @param childPrimaryKeyName - The primary key attribute name of the child entity (e.g., 'contactid').
 * @param childIds - An array of unique identifiers of the child records to associate with the parent record.
 * @returns A promise that resolves to the array of child IDs provided in the input.
 *
 * @example
 * // Associate a list of contact records with an account record.
 * const contactIdsToAssociate = ['f9e8d7c6-b5a4-3210-fedc-ba9876543210', '12345678-90ab-cdef-1234-567890abcdef'];
 * associateRecordToList('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'contact_customer_accounts', 'contacts', 'contactid', contactIdsToAssociate)
 * .then(associatedContactIds => console.log('Associated Contact IDs:', associatedContactIds))
 * .catch(error => console.error('Error associating contacts:', error));
 */
export declare function associateRecordToList(entitySetName: string, parentId: DataverseKey, propertyName: string, childEntitySetName: string, childPrimaryKeyName: string, childIds: DataverseKey[]): Promise<DataverseKey[]>;

export declare function attachEtag<T>(v: T): T;

/**
 * Creates an OData aggregation expression for calculating the average of a property.
 *
 * @param name The name of the property to average.
 * @param alias The alias for the resulting average value (defaults to the property name).
 * @returns An OData aggregation expression string for average.
 *
 * @example
 * average("price");             // returns "price with average as price"
 * average("price", "avgPrice"); // returns "price with average as avgPrice"
 */
export declare function average(name: string, alias?: string): string;

/**
 * Creates a data URL from a base64 encoded image string.
 *
 * @param base64 The base64 encoded image string.
 * @returns A data URL representing the image.
 *
 * @example
 * // Create a data URL from a base64 string:
 * const base64String = "iVBORw0KGgoAAAANSUhEUg..."; // A long base64 string
 * const imageUrl = base64ImageToURL(base64String);
 * // returns "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
 */
export declare function base64ImageToURL(base64: string): string;

/**
 * Generates a query expression for the "Between" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value1 - The first value to compare.
 * @param {string} value2 - The second value to compare.
 * @returns {string} The query expression for the "Between" operator.
 */
export declare function Between(name: string, value1: string, value2: string): string;

/**
 * A factory function to create a new BooleanProperty instance.
 *
 * @param name The name of the boolean property.
 * @returns A new BooleanProperty instance.
 */
export declare function boolean(name: string): BooleanProperty;

/**
 * Represents a boolean property within a dataverse schema.
 * Extends the base Property class with a boolean type and a default value of false.
 */
export declare class BooleanProperty extends Schema<boolean> {
    /**
     * The kind of schema element for a boolean property, which is "value".
     */
    kind: "value";
    /**
     * The type of the property, which is "boolean".
     */
    type: "boolean";
    /**
     * Creates a new BooleanProperty instance.
     *
     * @param name The name of the boolean property.
     */
    constructor(name: string);
}

/**
 * A factory function to create a new CollectionProperty instance.
 *
 * @template TProperties An object defining the properties of the related records in the collection.
 * @param name The name of the collection property.
 * @param getTable A function that, when called, returns the Table definition for the related records.
 * @returns A new CollectionProperty instance.
 */
export declare function collection<TProperties extends GenericProperties>(name: string, getTable: GetTable<Table<TProperties>>): CollectionProperty<TProperties>;

/**
 * A factory function to create a new LookupsProperty instance.
 *
 * @param name The name of the collection of lookup properties.
 * @param getTable A function that, when called, returns the Table definition for the related entity.
 * @returns A new LookupsProperty instance.
 */
export declare function collectionIds(name: string, getTable: GetTable): CollectionIdsProperty;

/**
 * Represents a collection of lookup (many-to-many navigation) properties within a dataverse schema.
 * Extends the base Property class to handle arrays of references to other records by their GUIDs.
 */
export declare class CollectionIdsProperty extends Schema<GUID[]> {
    #private;
    /**
     * The kind of schema element for a collection of lookups property, which is "navigation".
     */
    kind: "navigation";
    /**
     * The type of the property, which is "lookups".
     */
    type: "collectionIds";
    /**
     * Creates a new LookupsProperty instance.
     *
     * @param name The name of the collection of lookup properties.
     * @param getTable A function that, when called, returns the Table definition for the related entity. This is used to avoid circular dependencies.
     */
    constructor(name: string, getTable: GetTable);
    get table(): Table<{
        id: PrimaryKeyProperty;
    }>;
    /**
     * Transforms an array of values received from Dataverse into an array of GUIDs of the related records.
     * It iterates over the input array and extracts the value of the primary key property ('id') from each related record.
     *
     * @param value An array of raw data representing the related records from Dataverse.
     * @returns An array of GUIDs of the related records.
     */
    transformValueFromDataverse(value: any): GUID[];
    getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[];
}

/**
 * Represents a collection-valued navigation property within a dataverse schema.
 * Extends the base Property class to handle arrays of related records.
 *
 * @template TProperties An object defining the properties of the related records in the collection.
 */
export declare class CollectionProperty<TProperties extends GenericProperties> extends Schema<Infer<TProperties>[]> {
    #private;
    kind: "navigation";
    type: "collection";
    /**
     * Creates a new CollectionProperty instance.
     *
     * @param name The name of the collection property.
     * @param getTable A function that, when called, returns the Table definition for the related records. This is used to avoid circular dependencies.
     */
    constructor(name: string, getTable: GetTable<Table<TProperties>>);
    get table(): Table<TProperties>;
    /**
     * Transforms an array of values received from Dataverse into an array of transformed related records.
     * It iterates over the input array and uses the `transformValueFromDataverse` method of the related Table to transform each individual record.
     *
     * @param value An array of raw data representing the related records from Dataverse.
     * @returns An array of transformed related records of type `Infer<TProperties>[]`.
     */
    transformValueFromDataverse(value: any): Infer<TProperties>[];
    getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[];
}

export declare type Config = {
    url?: string;
    headers: {
        "OData-MaxVersion"?: string;
        "OData-Version"?: string;
        "Content-Type"?: string;
        "If-None-Match"?: string;
        Accept?: string;
        Prefer?: string;
        MSCRMCallerID?: string;
        CallerObjectId?: string;
    };
};

/**
 * Generates a query expression for the "Contains" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The value to check if it contains.
 * @returns {string} The query expression for the "Contains" operator.
 */
export declare function Contains(name: string, value: string): string;

/**
 * Creates an OData filter condition using the "contains" operator.
 * Checks if a string property contains a specified substring.
 *
 * @param name The name of the string property to check.
 * @param value The substring to search for.
 * @returns A string representing the "contains" filter condition.
 *
 * @example
 * contains("description", "software");
 * // returns "contains(description,'software')"
 *
 * // Example: Combining with equals
 * and(contains("description", "software"), equals("category", "application"));
 * // returns "contains(description,'software') and (category eq 'application')"
 */
export declare function contains(name: string, value: Primitive): string;

/**
 * Generates a query expression for the "ContainsValues" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {...string[]} values - The list of values to check if they are contained.
 * @returns {string} The query expression for the "ContainsValues" operator.
 */
export declare function ContainsValues(name: string, ...values: string[]): string;

/**
 * Creates an OData aggregation expression for counting the number of records.
 *
 * @param alias The alias for the resulting count value (defaults to "count").
 * @returns An OData aggregation expression string for count.
 *
 * @example
 * count();             // returns "$count as count"
 * count("recordCount"); // returns "$count as recordCount"
 */
export declare function count(alias?: string): string;

/**
 * Represents a Dataverse key, which can be either a GUID (primary key) or an AlternateKey.
 */
export declare type DataverseKey = GUID | AlternateKey;

/**
 * Represents a Dataverse record, which is essentially a JavaScript object
 * with properties corresponding to the columns/attributes in a Dataverse entity.
 * The 'any' type is used here because the structure of a Dataverse record
 * can vary significantly depending on the entity and the selected attributes.
 */
export declare type DataverseRecord = Record<string, Primitive>;

/**
 * A factory function to create a new DateProperty instance.
 *
 * @param name The name of the date property.
 * @returns A new DateProperty instance.
 */
export declare function date(name: string): DateProperty;

/**
 * Represents a date property within a dataverse schema.
 * Extends the base Property class with a Date or null type and a default value of null.
 */
declare class DateOnlyProperty extends Schema<Date | null> {
    /**
     * The kind of schema element for a date property, which is "value".
     */
    kind: "value";
    /**
     * The type of the property, which is "date".
     */
    type: "dateOnly";
    /**
     * Creates a new DateProperty instance.
     *
     * @param name The name of the date property.
     */
    constructor(name: string);
    /**
     * Transforms a value received from Dataverse into a Date object or null.
     * If the value is null, it returns null. Otherwise, it creates a new Date object from the Dataverse value.
     *
     * @param value The value received from Dataverse.
     * @returns A Date object or null.
     */
    transformValueFromDataverse(value: any): Date | null;
    transformValueToDataverse(value: any): string | null;
}

/**
 * Represents a date property within a dataverse schema.
 * Extends the base Property class with a Date or null type and a default value of null.
 */
export declare class DateProperty extends Schema<Date | null> {
    /**
     * The kind of schema element for a date property, which is "value".
     */
    kind: "value";
    /**
     * The type of the property, which is "date".
     */
    type: "date";
    /**
     * Creates a new DateProperty instance.
     *
     * @param name The name of the date property.
     */
    constructor(name: string);
    /**
     * Transforms a value received from Dataverse into a Date object or null.
     * If the value is null, it returns null. Otherwise, it creates a new Date object from the Dataverse value.
     *
     * @param value The value received from Dataverse.
     * @returns A Date object or null.
     */
    transformValueFromDataverse(value: any): Date | null;
}

/**
 * Deactivates a record in the specified Dataverse entity set by setting its 'statecode' to 1.
 * Note that the actual attribute name for the state code and the value for the inactive state might vary depending on the entity.
 * This function assumes the standard 'statecode' attribute with a value of 1 representing the inactive state.
 *
 * @param entitySetName - The logical name of the entity set where the record is located (e.g., 'accounts', 'contacts', 'opportunities').
 * @param id - The unique identifier of the record to deactivate.
 * @returns A promise that resolves to the ID of the deactivated record upon successful deactivation.
 *
 * @example
 * // Deactivate the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * deactivateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef')
 * .then(deactivatedAccountId => console.log('Deactivated Account ID:', deactivatedAccountId))
 * .catch(error => console.error('Error deactivating account:', error));
 *
 * @example
 * // Deactivate the opportunity record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210'.
 * deactivateRecord('opportunities', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210')
 * .then(deactivatedOpportunityId => console.log('Deactivated Opportunity ID:', deactivatedOpportunityId))
 * .catch(error => console.error('Error deactivating opportunity:', error));
 */
export declare function deactivateRecord(entitySetName: string, id: DataverseKey): Promise<string>;

/**
 * Deletes the value of a single-valued property of an existing Dataverse record, setting it to null.
 * This operation is only applicable to properties that support null values.
 *
 * @param entitySetName - The logical name of the entity set where the record is located (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record to update.
 * @param propertyName - The name of the single-valued property to delete (e.g., 'description', 'address1_fax').
 * @returns A promise that resolves to the ID of the updated record upon successful deletion of the property value.
 *
 * @example
 * // Delete the value of the 'description' property of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * deletePropertyValue('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'description')
 * .then(updatedAccountId => console.log('Updated Account ID:', updatedAccountId))
 * .catch(error => console.error('Error deleting account description:', error));
 *
 * @example
 * // Delete the value of the 'address1_fax' property of the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210'.
 * deletePropertyValue('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210', 'address1_fax')
 * .then(updatedContactId => console.log('Updated Contact ID:', updatedContactId))
 * .catch(error => console.error('Error deleting contact fax:', error));
 */
export declare function deletePropertyValue(entitySetName: string, id: DataverseKey, propertyName: string): Promise<DataverseKey>;

/**
 * Deletes a record from the specified Dataverse entity set.
 *
 * @param entitySetName - The logical name of the entity set where the record will be deleted (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record to delete.
 * @returns A promise that resolves to the ID of the deleted record upon successful deletion.
 *
 * @example
 * // Delete the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * deleteRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef')
 * .then(deletedAccountId => console.log('Deleted Account ID:', deletedAccountId))
 * .catch(error => console.error('Error deleting account:', error));
 *
 * @example
 * // Delete the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210'.
 * deleteRecord('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210')
 * .then(deletedContactId => console.log('Deleted Contact ID:', deletedContactId))
 * .catch(error => console.error('Error deleting contact:', error));
 */
export declare function deleteRecord(entitySetName: string, id: DataverseKey): Promise<DataverseKey>;

/**
 * Dissociates (removes the association between) a child record from a parent record through a single-valued or collection-valued navigation property in Dataverse.
 *
 * @param entitySetName - The logical name of the parent entity set (e.g., 'accounts', 'opportunities').
 * @param parentId - The unique identifier of the parent record.
 * @param propertyName - The name of the navigation property on the parent entity that points to the child record(s) (e.g., 'primarycontactid', 'contact_customer_accounts').
 * @param [childId] - The unique identifier of the child record to dissociate. This is required for collection-valued navigation properties and optional (or should be omitted) for single-valued navigation properties to clear the reference.
 * @returns A promise that resolves to the ID of the dissociated child record (if provided) or the parent record ID if dissociating a single-valued property.
 *
 * @example
 * // Dissociate the primary contact from the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef' (single-valued navigation property).
 * disssociateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'primarycontactid')
 * .then(parentId => console.log('Dissociated from Account ID:', parentId))
 * .catch(error => console.error('Error dissociating primary contact:', error));
 *
 * @example
 * // Dissociate the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210' from the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef' (collection-valued navigation property).
 * disssociateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'contact_customer_accounts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210')
 * .then(childId => console.log('Dissociated Contact ID:', childId))
 * .catch(error => console.error('Error dissociating contact:', error));
 */
export declare function disssociateRecord(entitySetName: string, parentId: DataverseKey, propertyName: string, childId?: DataverseKey): Promise<DataverseKey>;

/**
 * Generates a query expression for the "DoesNotContainValues" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {...string[]} values - The list of values to check if they are not contained.
 * @returns {string} The query expression for the "DoesNotContainValues" operator.
 */
export declare function DoesNotContainValues(name: string, ...values: string[]): string;

/**
 * Creates a validator function that checks if a string is a valid email address.
 * Uses a basic email validation regex.
 *
 * @returns A validator function that returns "Invalid email format" if the string is not a valid email address, otherwise undefined.
 *
 * @example
 * // Create an email validator:
 * const isEmail = email();
 *
 * // Validate an email address:
 * isEmail("test@example.com"); // returns undefined (valid)
 * isEmail("invalid");        // returns "Invalid email format" (invalid)
 * isEmail("test@.com");       // returns "Invalid email format" (invalid)
 */
export declare function email(): Validator<string>;

/**
 * Creates an OData filter condition using the "endswith" operator.
 * Checks if a string property ends with a specified substring.
 *
 * @param name The name of the string property to check.
 * @param value The substring to search for at the end of the property's value.
 * @returns A string representing the "endswith" filter condition.
 *
 * @example
 * endsWith("filename", ".txt"); // returns "endswith(filename,'.txt')"
 *
 * // Example: Combining with or
 * or(endsWith("filename", ".txt"), endsWith("filename", ".pdf"));
 * // returns "endswith(filename,'.txt') or endswith(filename,'.pdf')"
 */
export declare function endsWith(name: string, value: Primitive): string;

/**
 * Generates a query expression for the "EqualBusinessId" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualBusinessId" operator.
 */
export declare function EqualBusinessId(name: string): string;

/**
 * Generates a query expression for the "EqualRoleBusinessId" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualRoleBusinessId" operator.
 */
export declare function EqualRoleBusinessId(name: string): string;

/**
 * Creates an OData filter condition using the "eq" (equals) operator.
 * Checks if a property is equal to a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "equals" filter condition.
 *
 * @example
 * equals("age", 30);       // returns "(age eq 30)"
 * equals("name", "John"); // returns "(name eq 'John')"
 *
 * // Example: Combining with and
 * and(equals("age", 30), equals("name", "John"));
 * // returns "(age eq 30) and (name eq 'John')"
 */
export declare function equals(name: string, value: Primitive): string;

/**
 * Generates a query expression for the "EqualUserId" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualUserId" operator.
 */
export declare function EqualUserId(name: string): string;

/**
 * Generates a query expression for the "EqualUserLanguage" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualUserLanguage" operator.
 */
export declare function EqualUserLanguage(name: string): string;

/**
 * Generates a query expression for the "EqualUserOrUserHierarchy" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualUserOrUserHierarchy" operator.
 */
export declare function EqualUserOrUserHierarchy(name: string): string;

/**
 * Generates a query expression for the "EqualUserOrUserHierarchyAndTeams" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualUserOrUserHierarchyAndTeams" operator.
 */
export declare function EqualUserOrUserHierarchyAndTeams(name: string): string;

/**
 * Generates a query expression for the "EqualUserOrUserTeams" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualUserOrUserTeams" operator.
 */
export declare function EqualUserOrUserTeams(name: string): string;

/**
 * Generates a query expression for the "EqualUserTeams" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "EqualUserTeams" operator.
 */
export declare function EqualUserTeams(name: string): string;

export declare const Etag: unique symbol;

/**
 * Creates an OData $expand expression.
 *
 * @param values A string or a record representing the properties to expand.
 * If it is a string, it represents the navigation property name.
 * If it is a record, the key is the navigation property name, and the value is a NestedQuery.
 * @returns An OData $expand expression string.
 *
 * @example
 * // Expand a single navigation property:
 * $expand("orders");
 * // returns "orders"
 *
 * // Expand a navigation property with nested select:
 * $expand({ orders: { select: ["id", "orderDate"] } });
 * // returns "orders($select=id,orderDate)"
 *
 * // Expand a navigation property with nested expand:
 * $expand({
 * customer: {
 * select: ["id", "name"],
 * expand: { address: { select: ["city", "street"] } }
 * }
 * });
 * // returns "customer($select=id,name;$expand=address($select=city,street))"
 */
export declare function expand(values: string | Record<string, NestedQuery>): string;

export declare function fetchXml(entitySetName: string, xml: string): Promise<Record<string, Primitive>[]>;

/**
 * Represents a generic navigation property in a Dataverse entity.  Navigation
 * properties are used to define relationships between entities.
 */
export declare type GenericNavigationProperty = CollectionProperty<GenericProperties> | LookupProperty<GenericProperties> | LookupIdProperty | CollectionIdsProperty;

/**
 * Represents a generic object of properties, where the keys are property names
 * and the values are GenericProperty definitions.  This is used to define the
 * structure of a Dataverse entity.
 */
export declare type GenericProperties = Record<string, GenericProperty>;

/**
 * Represents a generic property in a Dataverse entity.  A property can be
 * either a navigation property or a value property.
 */
export declare type GenericProperty = GenericNavigationProperty | GenericValueProperty;

/**
 * Represents a generic value property in a Dataverse entity.  Value properties
 * store the actual data of an entity, such as strings, numbers, dates, etc.
 */
export declare type GenericValueProperty = PrimaryKeyProperty | StringProperty | NumberProperty | BooleanProperty | DateProperty | DateOnlyProperty | ImageProperty | ListProperty<string | number>;

/**
 * Retrieves a single associated record from a navigation property of a Dataverse record.
 *
 * @param entitySetName - The logical name of the primary entity set (e.g., 'accounts').
 * @param id - The unique identifier of the primary record.
 * @param navigationPropertyName - The name of the navigation property to the related record (e.g., 'primarycontactid', 'parentaccountid').
 * @param [query] - An optional OData query string to select fields or expand further related entities of the associated record (e.g., '$select=fullname,emailaddress1').
 * @returns A promise that resolves to the retrieved associated Dataverse record object.
 *
 * @example
 * // Retrieve the primary contact of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
 * // selecting their full name and email address.
 * getAssociatedRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'primarycontactid', '$select=fullname,emailaddress1')
 * .then(contact => console.log('Primary Contact:', contact))
 * .catch(error => console.error('Error retrieving primary contact:', error));
 *
 * @example
 * // Retrieve the parent account of the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210',
 * // selecting only the account name.
 * getAssociatedRecord('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210', 'parentaccountid', '$select=name')
 * .then(parentAccount => console.log('Parent Account:', parentAccount))
 * .catch(error => console.error('Error retrieving parent account:', error));
 */
export declare function getAssociatedRecord(entitySetName: string, id: DataverseKey, navigationPropertyName: string, query?: string): Promise<DataverseRecord | null>;

/**
 * Retrieves multiple associated records from a navigation property of a Dataverse record.
 *
 * @param entitySetName - The logical name of the primary entity set (e.g., 'accounts').
 * @param id - The unique identifier of the primary record.
 * @param navigationPropertyName - The name of the collection-valued navigation property to the related records (e.g., 'contact_customer_accounts', 'opportunity_customer_contacts').
 * @param [query=""] - An optional OData query string to filter, sort, select fields, and expand further related entities of the associated records (e.g., '$filter=startswith(fullname, \'B\')&$select=fullname,emailaddress1').
 * @returns A promise that resolves to an array of associated Dataverse record objects.
 *
 * @example
 * // Retrieve all contacts associated with the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * getAssociatedRecords('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'contact_customer_accounts')
 * .then(contacts => console.log('Associated Contacts:', contacts))
 * .catch(error => console.error('Error retrieving associated contacts:', error));
 *
 * @example
 * // Retrieve the full name and email address of all active contacts associated with the account record
 * // with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef', ordered by full name.
 * getAssociatedRecords('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'contact_customer_accounts', '$filter=statecode eq 0&$select=fullname,emailaddress1&$orderby=fullname')
 * .then(activeContacts => console.log('Active Associated Contacts:', activeContacts))
 * .catch(error => console.error('Error retrieving active associated contacts:', error));
 */
export declare function getAssociatedRecords(entitySetName: string, id: DataverseKey, navigationPropertyName: string, query?: string): Promise<DataverseRecord[]>;

/**
 * Constructs a URL to retrieve an image from Dataverse.
 *
 * @param entity The logical name of the entity the image belongs to.
 * @param name The name of the image attribute.
 * @param id The ID of the entity record.
 * @returns A URL string to download the image.
 *
 * @example
 * // Get the URL for a contact's profile image:
 * const imageUrl = getImageUrl("contact", "entityimage", "12345");
 * // returns "/Image/download.aspx?Entity=contact&Attribute=entityimage&Id=12345&Full=true"
 */
export declare function getImageUrl(entity: string, name: string, id: string): string;

/**
 * Recursively retrieves all records from a paginated Dataverse response using the `@odata.nextLink`.
 *
 * @param result - An object containing the current page of Dataverse records and an optional `@odata.nextLink` property for the next page.
 * @param result.value - An array of Dataverse record objects from the current page.
 * @param [result["@odata.nextLink"]] - An optional URL to the next page of records.
 * @returns A promise that resolves to a single array containing all retrieved Dataverse record objects across all pages.
 *
 * @example
 * // Assuming 'initialRecords' is the result of an initial call to getRecords.
 * getNextLink(initialRecords)
 * .then(allRecords => console.log('All Records:', allRecords))
 * .catch(error => console.error('Error retrieving all records:', error));
 */
export declare function getNextLink(result: {
    "@odata.nextLink"?: string;
    value: DataverseRecord[];
}): Promise<DataverseRecord[]>;

/**
 * Retrieves the raw value of a single property of a Dataverse record.
 * This is particularly useful for retrieving binary or other non-JSON formatted data.
 *
 * @param entitySetName - The logical name of the entity set (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record.
 * @param propertyName - The name of the property to retrieve the raw value of (e.g., 'entityimage', 'documentbody').
 * @returns A promise that resolves to the raw value of the property as a string.
 *
 * @example
 * // Retrieve the raw value (as a string) of the 'entityimage' property
 * // of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * getPropertyRawValue('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'entityimage')
 * .then(imageData => {
 * console.log('Raw Image Data (String):', imageData);
 * // You might need to further process this string depending on the actual data type.
 * })
 * .catch(error => console.error('Error retrieving raw image:', error));
 *
 * @example
 * // Retrieve the raw value (as a string) of the 'documentbody' property
 * // of a custom entity record named 'mydocument' with ID 'fedcba98-7654-3210-0fed-cba987654321'.
 * getPropertyRawValue('mydocument', 'fedcba98-7654-3210-0fed-cba987654321', 'documentbody')
 * .then(documentData => {
 * console.log('Raw Document Data (String):', documentData);
 * // You might need to decode this string (e.g., from Base64) to get the actual document content.
 * })
 * .catch(error => console.error('Error retrieving raw document:', error));
 */
export declare function getPropertyRawValue(entitySetName: string, id: DataverseKey, propertyName: string): Promise<string>;

/**
 * Constructs the URL to retrieve the raw value of a single property of a Dataverse record.
 * This is particularly useful for retrieving binary or other non-JSON formatted data.
 *
 * @param entitySetName - The logical name of the entity set (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record.
 * @param propertyName - The name of the property to retrieve the raw value of (e.g., 'entityimage', 'documentbody').
 * @returns The URL that can be used to fetch the raw property value.
 *
 * @example
 * // Get the URL to retrieve the raw value of the 'entityimage' property
 * // of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * const imageUrl = getPropertyRawValueURL('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'entityimage');
 * console.log('Image URL:', imageUrl);
 * // You can then use this URL with a fetch request to get the image data.
 *
 * @example
 * // Get the URL to retrieve the raw value of the 'documentbody' property
 * // of a custom entity record named 'mydocument' with ID 'fedcba98-7654-3210-0fed-cba987654321'.
 * const documentUrl = getPropertyRawValueURL('mydocument', 'fedcba98-7654-3210-0fed-cba987654321', 'documentbody');
 * console.log('Document URL:', documentUrl);
 */
export declare function getPropertyRawValueURL(entitySetName: string, id: DataverseKey, propertyName: string): string;

/**
 * Retrieves the value of a single property of a Dataverse record.
 *
 * @param entitySetName - The logical name of the entity set (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record.
 * @param propertyName - The name of the property to retrieve (e.g., 'name', 'emailaddress1').
 * @returns  A promise that resolves to the primitive value of the requested property (e.g., string, number, boolean).
 * @example
 * // Retrieve the 'name' property of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
 * getPropertyValue('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'name')
 * .then(accountName => console.log('Account Name:', accountName))
 * .catch(error => console.error('Error retrieving account name:', error));
 *
 * @example
 * // Retrieve the 'emailaddress1' property of the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210'
 * getPropertyValue('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210', 'emailaddress1')
 * .then(email => console.log('Contact Email:', email))
 * .catch(error => console.error('Error retrieving contact email:', error));
 */
export declare function getPropertyValue(entitySetName: string, id: DataverseKey, propertyName: string): Promise<Primitive>;

/**
 * Retrieves a single record from a Dataverse entity set.
 *
 * @param entitySetName - The logical name of the entity set (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record to retrieve. This could be a string GUID.
 * @param query An optional OData query string to filter or expand related entities (e.g., '$select=name,address1_city&$expand=primarycontactid($select=fullname)').
 * @returns A promise that resolves to the retrieved Dataverse record object.
 *
 * @example
 * // Retrieve the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
 * getRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef')
 * .then(account => console.log(account))
 * .catch(error => console.error('Error retrieving account:', error));
 *
 * @example
 * // Retrieve the name and city of the account record with the specified ID,
 * // and also expand the primary contact's full name.
 * getRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', '$select=name,address1_city&$expand=primarycontactid($select=fullname)')
 * .then(account => console.log(account))
 * .catch(error => console.error('Error retrieving account with query:', error));
 */
export declare function getRecord(entitySetName: string, id: DataverseKey, query?: string): Promise<DataverseRecord | null>;

/**
 * Retrieves multiple records from a Dataverse entity set.
 *
 * @param entitySetName - The logical name of the entity set (e.g., 'accounts', 'contacts').
 * @param [query] - An optional OData query string to filter, sort, select fields, and expand related entities (e.g., '$filter=startswith(name, \'A\')&$orderby=name desc&$select=name,address1_city&$expand=primarycontactid($select=fullname)').
 * @returns A promise that resolves to an array of Dataverse record objects.
 *
 * @example
 * // Retrieve all account records.
 * getRecords('accounts')
 * .then(accounts => console.log('Accounts:', accounts))
 * .catch(error => console.error('Error retrieving accounts:', error));
 *
 * @example
 * // Retrieve the name and city of all active account records, ordered by name.
 * getRecords('accounts', '$filter=statecode eq 0&$select=name,address1_city&$orderby=name')
 * .then(activeAccounts => console.log('Active Accounts:', activeAccounts))
 * .catch(error => console.error('Error retrieving active accounts:', error));
 */
export declare function getRecords(entitySetName: string, query?: string): Promise<DataverseRecord[]>;

export declare type GetTable<T = any> = () => T;

export declare const globalConfig: Config;

/**
 * Creates an OData filter condition using the "gt" (greater than) operator.
 * Checks if a property is greater than a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "greater than" filter condition.
 *
 * @example
 * greaterThan("price", 10.50); // returns "(price gt 10.50)"
 *
 * // Example: Combining with and
 * and(greaterThan("price", 10), lessThan("price", 20));
 * // returns "(price gt 10 and price lt 20)"
 */
export declare function greaterThan(name: string, value: Primitive): string;

/**
 * Creates an OData filter condition using the "ge" (greater than or equal) operator.
 * Checks if a property is greater than or equal to a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "greater than or equal" filter condition.
 *
 * @example
 * greaterThanOrEqual("quantity", 10); // returns "(quantity ge 10)"
 *
 * // Example: Combining with or
 * or(greaterThanOrEqual("quantity", 10), equals("quantity", 5));
 * // returns "(quantity ge 10) or (quantity eq 5)"
 */
export declare function greaterThanOrEqual(name: string, value: Primitive): string;

/**
 * Creates an OData groupby expression.
 *
 * @param values An array of property names to group by.  Empty or null values will be filtered out.
 * @param aggregations Optional aggregation expressions to apply to the grouped data.
 * @returns An OData groupby expression string.
 *
 * @example
 * // Group by a single property:
 * groupby(["category"]); // returns "groupby((category))"
 *
 * // Group by multiple properties:
 * groupby(["category", "region", "year"]); // returns "groupby((category,region,year))"
 *
 * // Group by a single property with aggregation:
 * groupby(["category"], "aggregate(price with average as avgPrice)");
 * // returns "groupby((category),aggregate(price with average as avgPrice))"
 *
 * // Group by multiple properties with multiple aggregations:
 * groupby(["category", "region"], aggregate(price with average as avgPrice, quantity with sum as totalQuantity));
 * // returns "groupby((category,region),aggregate(price with average as avgPrice, quantity with sum as totalQuantity))"
 */
export declare function groupby(values: string[], aggregations?: string): string;

/**
 * Represents a GUID (Globally Unique Identifier) string, a standard identifier
 * used extensively in Dataverse (and Microsoft technologies in general).
 * The format is a string with five sections separated by hyphens.
 */
export declare type GUID = `${string}-${string}-${string}-${string}-${string}`;

/**
 * A factory function to create a new ImageProperty instance.
 *
 * @param name The name of the image property.
 * @returns A new ImageProperty instance.
 */
export declare function image(name: string): ImageProperty;

/**
 * Represents an image property within a dataverse schema.
 * Extends the base Property class with a string or null type to store the image data (e.g., as a base64 encoded string) and a default value of null.
 */
export declare class ImageProperty extends Schema<string | null> {
    /**
     * The kind of schema element for an image property, which is "value".
     */
    kind: "value";
    /**
     * The type of the property, which is "image".
     */
    type: "image";
    /**
     * Creates a new ImageProperty instance.
     *
     * @param name The name of the image property.
     */
    constructor(name: string);
}

/**
 * Generates a query expression for the "In" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {...string[]} values - The list of values to check if they are in the set.
 * @returns {string} The query expression for the "In" operator.
 */
export declare function In(name: string, ...values: string[]): string;

/**
 * Infers the TypeScript type from a Dataverse schema definition.  This is a recursive
 * type that drills down through the schema definition (which can be a Table,
 * GenericProperties, or a Property) to extract the corresponding TypeScript type.
 *
 * @template T The Dataverse schema definition.
 */
export declare type Infer<T> = T extends Table<infer U> ? Infer<U> : T extends GenericProperties ? {
    [K in keyof T]: Infer<T[K]>;
} : T extends CollectionProperty<infer U> ? Infer<U>[] : T extends LookupProperty<infer U> ? Infer<U> | null : T extends Schema<infer U> ? U : never;

/**
 * Generates a query expression for the "InFiscalPeriod" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The fiscal period value.
 * @returns {string} The query expression for the "InFiscalPeriod" operator.
 */
export declare function InFiscalPeriod(name: string, value: number): string;

/**
 * Generates a query expression for the "InFiscalPeriodAndYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} fiscalPeriod - The fiscal period value.
 * @param {number} fiscalYear - The fiscal year value.
 * @returns {string} The query expression for the "InFiscalPeriodAndYear" operator.
 */
export declare function InFiscalPeriodAndYear(name: string, fiscalPeriod: number, fiscalYear: number): string;

/**
 * Generates a query expression for the "InFiscalYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The fiscal year value.
 * @returns {string} The query expression for the "InFiscalYear" operator.
 */
export declare function InFiscalYear(name: string, value: number): string;

/**
 * Generates a query expression for the "InOrAfterFiscalPeriodAndYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} fiscalPeriod - The fiscal period value.
 * @param {number} fiscalYear - The fiscal year value.
 * @returns {string} The query expression for the "InOrAfterFiscalPeriodAndYear" operator.
 */
export declare function InOrAfterFiscalPeriodAndYear(name: string, fiscalPeriod: number, fiscalYear: number): string;

/**
 * Generates a query expression for the "InOrBeforeFiscalPeriodAndYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} fiscalPeriod - The fiscal period value.
 * @param {number} fiscalYear - The fiscal year value.
 * @returns {string} The query expression for the "InOrBeforeFiscalPeriodAndYear" operator.
 */
export declare function InOrBeforeFiscalPeriodAndYear(name: string, fiscalPeriod: number, fiscalYear: number): string;

/**
 * Creates a validator function that checks if a value is an integer.  It can validate both numbers and strings.
 *
 * @returns A validator function that returns "Must be an integer" if the value is not an integer, otherwise undefined.
 *
 * @example
 * // Create an integer validator:
 * const isInteger = integer();
 *
 * // Validate a number:
 * isInteger(10);     // returns undefined (valid)
 * isInteger(10.5);   // returns "Must be an integer" (invalid)
 *
 * // Validate a string:
 * isInteger("10");   // returns undefined (valid)
 * isInteger("10.5"); // returns "Must be an integer" (invalid)
 * isInteger("abc");  // returns "Must be an integer" (invalid)
 */
export declare function integer(): Validator<number | string>;

/**
 * Checks if a value is a non-empty string.
 *
 * @param value The value to check.
 * @returns `true` if the value is a string with a length greater than zero, otherwise `false`.
 *
 * @example
 * isNonEmptyString("hello"); // returns true
 * isNonEmptyString("");      // returns false
 * isNonEmptyString(123);     // returns false
 * isNonEmptyString(null);    // returns false
 */
export declare function isNonEmptyString(value: any): boolean;

/**
 * Creates an OData key string from a record of key-value pairs.
 * Used for identifying entities by alternate keys.
 *
 * @param keys A record of key-value pairs representing the alternate key.
 * @returns An OData key string.
 *
 * @example
 * // Create key string for a single key:
 * keys({ email: "test@example.com" });
 * // returns "email='test@example.com'"
 *
 * // Create key string for multiple keys:
 * keys({ region: "US", code: 123 });
 * // returns "region='US',code=123"
 */
export declare function keys(keys: Record<string, Primitive>): AlternateKey;

/**
 * Generates a query expression for the "Last7Days" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "Last7Days" operator.
 */
export declare function Last7Days(name: string): string;

/**
 * Generates a query expression for the "LastFiscalPeriod" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "LastFiscalPeriod" operator.
 */
export declare function LastFiscalPeriod(name: string): string;

/**
 * Generates a query expression for the "LastFiscalYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "LastFiscalYear" operator.
 */
export declare function LastFiscalYear(name: string): string;

/**
 * Generates a query expression for the "LastMonth" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "LastMonth" operator.
 */
export declare function LastMonth(name: string): string;

/**
 * Generates a query expression for the "LastWeek" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "LastWeek" operator.
 */
export declare function LastWeek(name: string): string;

/**
 * Generates a query expression for the "LastXDays" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last days.
 * @returns {string} The query expression for the "LastXDays" operator.
 */
export declare function LastXDays(name: string, value: number): string;

/**
 * Generates a query expression for the "LastXFiscalPeriods" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last fiscal periods.
 * @returns {string} The query expression for the "LastXFiscalPeriods" operator.
 */
export declare function LastXFiscalPeriods(name: string, value: number): string;

/**
 * Generates a query expression for the "LastXFiscalYears" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last fiscal years.
 * @returns {string} The query expression for the "LastXFiscalYears" operator.
 */
export declare function LastXFiscalYears(name: string, value: number): string;

/**
 * Generates a query expression for the "LastXHours" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last hours.
 * @returns {string} The query expression for the "LastXHours" operator.
 */
export declare function LastXHours(name: string, value: number): string;

/**
 * Generates a query expression for the "LastXMonths" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last months.
 * @returns {string} The query expression for the "LastXMonths" operator.
 */
export declare function LastXMonths(name: string, value: number): string;

/**
 * Generates a query expression for the "LastXWeeks" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last weeks.
 * @returns {string} The query expression for the "LastXWeeks" operator.
 */
export declare function LastXWeeks(name: string, value: number): string;

/**
 * Generates a query expression for the "LastXYears" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of last years.
 * @returns {string} The query expression for the "LastXYears" operator.
 */
export declare function LastXYears(name: string, value: number): string;

/**
 * Generates a query expression for the "LastYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "LastYear" operator.
 */
export declare function LastYear(name: string): string;

/**
 * Creates an OData filter condition using the "lt" (less than) operator.
 * Checks if a property is less than a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "less than" filter condition.
 *
 * @example
 * lessThan("temperature", 0); // returns "(temperature lt 0)"
 *
 * // Example: Combining with and
 * and(lessThan("temperature", 0), greaterThan("temperature", -10));
 * // returns "(temperature lt 0 and temperature gt -10)"
 */
export declare function lessThan(name: string, value: Primitive): string;

/**
 * Creates an OData filter condition using the "le" (less than or equal) operator.
 * Checks if a property is less than or equal to a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "less than or equal" filter condition.
 *
 * @example
 * lessThanOrEqual("rating", 5); // returns "(rating le 5)"
 *
 * // Example: Combining with or
 * or(lessThanOrEqual("rating", 5), equals("rating", 1));
 * // returns "(rating le 5) or (rating eq 1)"
 */
export declare function lessThanOrEqual(name: string, value: Primitive): string;

/**
 * A factory function to create a new ListProperty instance.
 *
 * @template T The type of the values in the list (either string or number).
 * @param name The name of the list property.
 * @param list An array of valid string or number values for this property.
 * @returns A new ListProperty instance.
 */
export declare function list<T extends string | number>(name: string, list: Array<T>): ListProperty<T>;

/**
 * Represents a list (picklist or dropdown) property within a dataverse schema.
 * Extends the base Property class to enforce that the value is either null or one of the values in the provided list.
 *
 * @template T The type of the values in the list (either string or number).
 */
export declare class ListProperty<T extends string | number> extends Schema<T | null> {
    /**
     * The kind of schema element for a list property, which is "value".
     */
    kind: "value";
    /**
     * The type of the property, which is "list".
     */
    type: "list";
    /**
     * The array of valid values for this list property.
     */
    list: Array<T>;
    /**
     * Creates a new ListProperty instance.
     *
     * @param name The name of the list property.
     * @param list An array of valid string or number values for this property.
     */
    constructor(name: string, list: Array<T>);
}

/**
 * A factory function to create a new ExpandProperty instance.
 *
 * @template TProperties An object defining the properties of the related record.
 * @param name The name of the expand property.
 * @param getTable A function that, when called, returns the Table definition for the related record.
 * @returns A new ExpandProperty instance.
 */
export declare function lookup<TProperties extends GenericProperties>(name: string, getTable: GetTable<Table<TProperties>>): LookupProperty<TProperties>;

/**
 * A factory function to create a new LookupProperty instance.
 *
 * @param name The logical name of the navigation property.
 * @param getTable A function that, when called, returns the Table definition for the related entity.
 * @returns A new LookupProperty instance.
 */
export declare function lookupId(name: string, getTable: GetTable): LookupIdProperty;

/**
 * Represents a lookup (single-valued navigation) property within a dataverse schema.
 * Extends the base Property class to handle references to other records by their GUID.
 */
export declare class LookupIdProperty extends Schema<GUID | null> {
    #private;
    /**
     * The kind of schema element for a lookup property, which is "navigation".
     */
    kind: "navigation";
    /**
     * The type of the property, which is "lookup".
     */
    type: "lookupId";
    /**
     * The logical name of the navigation property in the Dataverse entity.
     */
    navigationName: string;
    /**
     * Creates a new LookupProperty instance.
     * The internal name of the property in Dataverse will be `_${name.toLowerCase()}_value`.
     *
     * @param name The logical name of the navigation property.
     * @param getTable A function that, when called, returns the Table definition for the related entity. This is used to avoid circular dependencies.
     */
    constructor(name: string, getTable: GetTable);
    get table(): Table<{
        id: PrimaryKeyProperty;
    }>;
    /**
     * Transforms the property's value (a GUID) into a format suitable for sending to Dataverse for association.
     * If a value (GUID) is provided, it formats it as `entitySetName(value)`. If the value is null, it returns null.
     *
     * @param value The GUID of the related record.
     * @returns A string in the format `entitySetName(guid)` or null.
     */
    transformValueToDataverse(value: any): string | null;
}

/**
 * Represents an expand navigation property within a dataverse schema.
 * Extends the base Property class to handle a single related record that is typically fetched using the `$expand` OData query option.
 *
 * @template TProperties An object defining the properties of the related record.
 */
export declare class LookupProperty<TProperties extends GenericProperties> extends Schema<Infer<TProperties> | null> {
    #private;
    /**
     * The kind of schema element for an expand property, which is "navigation".
     */
    kind: "navigation";
    /**
     * The type of the property, which is "expand".
     */
    type: "lookup";
    /**
     * Creates a new ExpandProperty instance.
     *
     * @param name The name of the expand property.
     * @param getTable A function that, when called, returns the Table definition for the related record. This is used to avoid circular dependencies.
     */
    constructor(name: string, getTable: GetTable<Table<TProperties>>);
    get table(): Table<TProperties>;
    /**
     * Transforms a value received from Dataverse into a transformed related record or null.
     * It uses the `transformValueFromDataverse` method of the related Table to transform the data. If the value is null or undefined, it returns null.
     *
     * @param value The raw data representing the related record from Dataverse.
     * @returns The transformed related record of type `Infer<TProperties>` or null.
     */
    transformValueFromDataverse(value: any): Infer<TProperties> | null;
    getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[];
}

/**
 * Maps choice/picklist data from a Dataverse option set into a more usable format.
 *
 * @param data The raw choice/picklist data from Dataverse.
 * @returns An array of objects, where each object represents a choice option
 * and contains the properties: value, color, label, and description.
 *
 * @example
 * // Map choice data:
 * const rawData = {
 * Options: [
 * { Value: 1, Color: "red", Label: { UserLocalizedLabel: { Label: "Red" } }, Description: { UserLocalizedLabel: { Label: "The color red" } } },
 * { Value: 2, Color: "blue", Label: { UserLocalizedLabel: { Label: "Blue" } }, Description: { UserLocalizedLabel: { Label: "The color blue" } } },
 * ]
 * };
 * const mappedChoices = mapChoices(rawData);
 * // returns
 * // [
 * //   { value: 1, color: "red", label: "Red", description: "The color red" },
 * //   { value: 2, color: "blue", label: "Blue", description: "The color blue" }
 * // ]
 */
export declare function mapChoices(data: any): {
    value: number;
    color: string;
    label: string;
    description: string;
}[];

/**
 * Creates an OData aggregation expression for finding the maximum value of a property.
 *
 * @param name The name of the property to find the maximum of.
 * @param alias The alias for the resulting maximum value (defaults to the property name).
 * @returns An OData aggregation expression string for max.
 *
 * @example
 * max("price");           // returns "price with max as price"
 * max("price", "maxPrice"); // returns "price with max as maxPrice"
 */
export declare function max(name: string, alias?: string): string;

/**
 * Creates a validator function that checks if the length of a value is less than or equal to a maximum length.
 *
 * @param max The maximum length.
 * @returns A validator function that returns an error message if the length is greater than the maximum, otherwise undefined.
 *
 * @example
 * // Create a maxLength validator:
 * const maxLength10 = maxLength(10);
 *
 * // Validate a string:
 * maxLength10("hello");         // returns undefined (valid)
 * maxLength10("hello world!"); // returns "Length more than 10" (invalid)
 *
 * // Validate an array:
 * maxLength10([1, 2, 3, 4, 5]);   // returns undefined (valid)
 * maxLength10([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // returns "Length more than 10" (invalid)
 */
export declare function maxLength(max: number): (v: {
    length: number;
}) => string | undefined;

/**
 * Creates a validator function that checks if a number is less than or equal to a maximum value.
 *
 * @param max The maximum value.
 * @returns A validator function that returns an error message if the number is greater than the maximum, otherwise undefined.
 *
 * @example
 * // Create a maxValue validator:
 * const maxAge65 = maxValue(65);
 *
 * // Validate an age:
 * maxAge65(40); // returns undefined (valid)
 * maxAge65(70); // returns "Must be no more than 65" (invalid)
 */
export declare function maxValue(max: number): Validator<number>;

/**
 * Retains references to previous recrods if ETag value is unchanged
 *
 * @param prevRecords
 * @param newRecords
 * @returns
 */
export declare function mergeRecords<T>(prevRecords: T[], newRecords: T[]): T[];

/**
 * Creates an OData aggregation expression for finding the minimum value of a property.
 *
 * @param name The name of the property to find the minimum of.
 * @param alias The alias for the resulting minimum value (defaults to the property name).
 * @returns An OData aggregation expression string for min.
 *
 * @example
 * min("price");           // returns "price with min as price"
 * min("price", "minPrice"); // returns "price with min as minPrice"
 */
export declare function min(name: string, alias?: string): string;

/**
 * Creates a validator function that checks if the length of a value is greater than or equal to a minimum length.
 *
 * @param min The minimum length.
 * @returns A validator function that returns an error message if the length is less than the minimum, otherwise undefined.
 *
 * @example
 * // Create a minLength validator:
 * const minLength5 = minLength(5);
 *
 * // Validate a string:
 * minLength5("hello");       // returns undefined (valid)
 * minLength5("hi");          // returns "Length less than 5" (invalid)
 *
 * // Validate an array:
 * minLength5([1, 2, 3, 4, 5]); // returns undefined (valid)
 * minLength5([1, 2, 3]);       // returns "Length less than 5" (invalid)
 */
export declare function minLength(min: number): (v: {
    length: number;
}) => string | undefined;

/**
 * Creates a validator function that checks if a number is greater than or equal to a minimum value.
 *
 * @param min The minimum value.
 * @returns A validator function that returns an error message if the number is less than the minimum, otherwise undefined.
 *
 * @example
 * // Create a minValue validator:
 * const minAge18 = minValue(18);
 *
 * // Validate an age:
 * minAge18(21); // returns undefined (valid)
 * minAge18(15); // returns "Must be at least 18" (invalid)
 */
export declare function minValue(min: number): Validator<number>;

/**
 * Utility type to narrow down the keys of an object `T`
 * to only those keys whose values are of type `V`.
 *
 * @template T The type of the object.
 * @template V The type of the values to filter for.
 *
 * @example
 * interface MyObject {
 * id: number;
 * name: string;
 * isActive: boolean;
 * email: string;
 * }
 *
 * type StringKeys = NarrowKeysByValue<MyObject, string>;  // "name" | "email"
 */
export declare type NarrowKeysByValue<T extends object, V> = {
    [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

export declare type NestedQuery = string | {
    select?: string | string[];
    expand?: string | Record<string, NestedQuery>;
};

/**
 * Generates a query expression for the "Next7Days" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "Next7Days" operator.
 */
export declare function Next7Days(name: string): string;

/**
 * Generates a query expression for the "NextFiscalPeriod" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NextFiscalPeriod" operator.
 */
export declare function NextFiscalPeriod(name: string): string;

/**
 * Generates a query expression for the "NextFiscalYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NextFiscalYear" operator.
 */
export declare function NextFiscalYear(name: string): string;

/**
 * Generates a query expression for the "NextMonth" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NextMonth" operator.
 */
export declare function NextMonth(name: string): string;

/**
 * Generates a query expression for the "NextWeek" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NextWeek" operator.
 */
export declare function NextWeek(name: string): string;

/**
 * Generates a query expression for the "NextXDays" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next days.
 * @returns {string} The query expression for the "NextXDays" operator.
 */
export declare function NextXDays(name: string, value: number): string;

/**
 * Generates a query expression for the "NextXFiscalPeriods" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next fiscal periods.
 * @returns {string} The query expression for the "NextXFiscalPeriods" operator.
 */
export declare function NextXFiscalPeriods(name: string, value: number): string;

/**
 * Generates a query expression for the "NextXFiscalYears" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next fiscal years.
 * @returns {string} The query expression for the "NextXFiscalYears" operator.
 */
export declare function NextXFiscalYears(name: string, value: number): string;

/**
 * Generates a query expression for the "NextXHours" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next hours.
 * @returns {string} The query expression for the "NextXHours" operator.
 */
export declare function NextXHours(name: string, value: number): string;

/**
 * Generates a query expression for the "NextXMonths" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next months.
 * @returns {string} The query expression for the "NextXMonths" operator.
 */
export declare function NextXMonths(name: string, value: number): string;

/**
 * Generates a query expression for the "NextXWeeks" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next weeks.
 * @returns {string} The query expression for the "NextXWeeks" operator.
 */
export declare function NextXWeeks(name: string, value: number): string;

/**
 * Generates a query expression for the "NextXYears" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of next years.
 * @returns {string} The query expression for the "NextXYears" operator.
 */
export declare function NextXYears(name: string, value: number): string;

/**
 * Generates a query expression for the "NextYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NextYear" operator.
 */
export declare function NextYear(name: string): string;

/**
 * Negates an OData filter condition using the "not" operator.
 * Returns an empty string if the provided condition is null, undefined, or an empty string.
 *
 * @param condition The OData filter condition to negate.
 * @returns A string representing the negated condition, or an empty string if the condition is invalid.
 *
 * @example
 * // Example 1: Negating an equals condition
 * not(equals("name", "John")); // returns "not(name eq 'John')"
 *
 * // Example 2: Negating a combined condition
 * not(and(equals("age", 30), equals("city", "New York")));
 * // returns "not((age eq 30 and city eq 'New York'))"
 *
 * // Example 3: Handling empty condition
 * not("");            // returns ""
 */
export declare function not(condition: string): string;

/**
 * Generates a query expression for the "NotBetween" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value1 - The first value to compare.
 * @param {string} value2 - The second value to compare.
 * @returns {string} The query expression for the "NotBetween" operator.
 */
export declare function NotBetween(name: string, value1: string, value2: string): string;

/**
 * Generates a query expression for the "NotEqualBusinessId" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NotEqualBusinessId" operator.
 */
export declare function NotEqualBusinessId(name: string): string;

/**
 * Creates an OData filter condition using the "ne" (not equals) operator.
 * Checks if a property is not equal to a specified value.
 *
 * @param name The name of the property to compare.
 * @param value The value to compare the property against.
 * @returns A string representing the "not equals" filter condition.
 *
 * @example
 * notEquals("age", 30);       // returns "(age ne 30)"
 * notEquals("name", "John"); // returns "(name ne 'John')"
 *
 * // Example: Combining with or and not
 * or(notEquals("status", "completed"), not(equals("priority", "low")));
 * // returns "(status ne 'completed') or not(priority eq 'low')"
 */
export declare function notEquals(name: string, value: Primitive): string;

/**
 * Generates a query expression for the "NotEqualUserId" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "NotEqualUserId" operator.
 */
export declare function NotEqualUserId(name: string): string;

/**
 * Generates a query expression for the "NotIn" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {...string[]} values - The list of values to check if they are not in the set.
 * @returns {string} The query expression for the "NotIn" operator.
 */
export declare function NotIn(name: string, ...values: string[]): string;

/**
 * Generates a query expression for the "NotUnder" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The value to compare.
 * @returns {string} The query expression for the "NotUnder" operator.
 */
export declare function NotUnder(name: string, value: string): string;

/**
 * A factory function to create a new NumberProperty instance.
 *
 * @param name The name of the number property.
 * @returns A new NumberProperty instance.
 */
export declare function number(name: string): NumberProperty;

/**
 * Represents a number property within a dataverse schema.
 * Extends the base Property class with a number or null type and a default value of null.
 */
export declare class NumberProperty extends Schema<number | null> {
    /**
     * The kind of schema element for a number property, which is "value".
     */
    kind: "value";
    /**
     * The type of the property, which is "number".
     */
    type: "number";
    /**
     * Creates a new NumberProperty instance.
     *
     * @param name The name of the number property.
     */
    constructor(name: string);
}

/**
 * Creates a validator function that checks if a value is a number. It can validate both numbers and strings.
 *
 * @returns A validator function that returns "Must be a number" if the value is not a number, otherwise undefined.
 *
 * @example
 * // Create a numeric validator:
 * const isNumeric = numeric();
 *
 * // Validate a number:
 * isNumeric(10);     // returns undefined (valid)
 * isNumeric(10.5);   // returns undefined (valid)
 *
 * // Validate a string:
 * isNumeric("10");   // returns undefined (valid)
 * isNumeric("10.5"); // returns undefined (valid)
 * isNumeric("abc");  // returns "Must be a number" (invalid)
 */
export declare function numeric(): Validator<number | string>;

/**
 * Generates a query expression for the "OlderThanXDays" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of days.
 * @returns {string} The query expression for the "OlderThanXDays" operator.
 */
export declare function OlderThanXDays(name: string, value: number): string;

/**
 * Generates a query expression for the "OlderThanXHours" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of hours.
 * @returns {string} The query expression for the "OlderThanXHours" operator.
 */
export declare function OlderThanXHours(name: string, value: number): string;

/**
 * Generates a query expression for the "OlderThanXMinutes" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of minutes.
 * @returns {string} The query expression for the "OlderThanXMinutes" operator.
 */
export declare function OlderThanXMinutes(name: string, value: number): string;

/**
 * Generates a query expression for the "OlderThanXMonths" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of months.
 * @returns {string} The query expression for the "OlderThanXMonths" operator.
 */
export declare function OlderThanXMonths(name: string, value: number): string;

/**
 * Generates a query expression for the "OlderThanXWeeks" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of weeks.
 * @returns {string} The query expression for the "OlderThanXWeeks" operator.
 */
export declare function OlderThanXWeeks(name: string, value: number): string;

/**
 * Generates a query expression for the "OlderThanXYears" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {number} value - The number of years.
 * @returns {string} The query expression for the "OlderThanXYears" operator.
 */
export declare function OlderThanXYears(name: string, value: number): string;

/**
 * Generates a query expression for the "On" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The date value.
 * @returns {string} The query expression for the "On" operator.
 */
export declare function On(name: string, value: string): string;

/**
 * Generates a query expression for the "OnOrAfter" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The date value.
 * @returns {string} The query expression for the "OnOrAfter" operator.
 */
export declare function OnOrAfter(name: string, value: string): string;

/**
 * Generates a query expression for the "OnOrBefore" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The date value.
 * @returns {string} The query expression for the "OnOrBefore" operator.
 */
export declare function OnOrBefore(name: string, value: string): string;

/**
 * Combines multiple OData filter conditions with the "or" operator.
 * Filters out any null or undefined conditions.
 *
 * @param conditions An array of OData filter conditions (strings), which can be null or undefined.
 * @returns A string representing the combined conditions, or an empty string if no valid conditions are provided.
 *
 * @example
 * // Example 1: Combining equals conditions
 * or(equals("name", "John"), equals("name", "Jane"));
 * // returns "(name eq 'John' or name eq 'Jane')"
 *
 * // Example 2: Combining with not
 * or(not(equals("status", "completed")), equals("priority", "high"));
 * // returns "(not(status eq 'completed') or priority eq 'high')"
 *
 * // Example 3: Handling null/undefined conditions
 * or("name eq 'John'", null, "name eq 'Jane'");
 * // returns "(name eq 'John' or name eq 'Jane')"
 */
export declare function or(...conditions: (string | null | undefined)[]): string;

/**
 * Creates an OData $orderby expression.
 *
 * @param values A record where the key is the property name and the value is "asc" or "desc".
 * @returns An OData $orderby expression string.
 *
 * @example
 * // Order by a single property ascending:
 * $orderby({ name: "asc" });
 * // returns "name asc"
 *
 * // Order by multiple properties:
 * $orderby({ name: "asc", age: "desc" });
 * // returns "name asc,age desc"
 */
export declare function orderby(values: Record<string, "asc" | "desc">): string;

/**
 * Updates an existing record in the specified Dataverse entity set and returns the updated record with all its properties.
 *
 * @param entitySetName - The logical name of the entity set where the record will be updated (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record to update.
 * @param value - An object representing the data to update for the record. The keys of this object should correspond to the schema names of the entity's attributes that need to be modified.
 * @param [query=""] - An optional OData query string to include additional information in the returned updated record (e.g., '$expand=primarycontactid($select=fullname)').
 * @returns A promise that resolves to the updated Dataverse record object, including all its properties as requested by the `Prefer` header.
 *
 * @example
 * // Update the 'name' and 'address1_city' of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
 * const updatedAccountData = { name: 'Updated Contoso Ltd.', address1_city: 'Redmond' };
 * patchRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', updatedAccountData)
 * .then(updatedAccount => console.log('Updated Account:', updatedAccount))
 * .catch(error => console.error('Error updating account:', error));
 *
 * @example
 * // Update the 'jobtitle' of the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210' and expand their parent account's name.
 * const updatedContactData = { jobtitle: 'Marketing Manager' };
 * patchRecord('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210', updatedContactData, '$expand=parentcustomerid($select=name)')
 * .then(updatedContact => console.log('Updated Contact:', updatedContact))
 * .catch(error => console.error('Error updating contact:', error));
 */
export declare function patchRecord(entitySetName: string, id: DataverseKey, value: DataverseRecord, query?: string): Promise<DataverseRecord>;

/**
 * Creates a validator function that checks if a string matches a regular expression.
 *
 * @param regex The regular expression to test against.
 * @param message An optional custom error message.  Defaults to "Invalid format".
 * @returns A validator function that returns an error message if the string does not match the regex, otherwise undefined.
 *
 * @example
 * // Create a pattern validator for US phone numbers:
 * const phonePattern = pattern(/^\d{3}-\d{3}-\d{4}$/, "Invalid phone number format (e.g., 123-456-7890)");
 *
 * // Validate a phone number:
 * phonePattern("123-456-7890"); // returns undefined (valid)
 * phonePattern("1234567890");   // returns "Invalid phone number format (e.g., 123-456-7890)" (invalid)
 * phonePattern("abc-def-ghij");   // returns "Invalid phone number format (e.g., 123-456-7890)" (invalid)
 */
export declare function pattern(regex: RegExp, message?: string): Validator<string>;

/**
 * Creates a new record in the specified Dataverse entity set and returns the newly created record with all its properties.
 *
 * @param entitySetName - The logical name of the entity set where the record will be created (e.g., 'accounts', 'contacts').
 * @param value - An object representing the data for the new record. The keys of this object should correspond to the schema names of the entity's attributes.
 * @param [query=""] - An optional OData query string to include additional information in the returned record (e.g., '$expand=primarycontactid($select=fullname)').
 * @returns A promise that resolves to the newly created Dataverse record object, including all its properties as requested by the `Prefer` header.
 *
 * @example
 * // Create a new account record with the name 'Fabrikam Inc.' and retrieve the complete record.
 * const newAccount = { name: 'Fabrikam Inc.' };
 * postRecord('accounts', newAccount)
 * .then(createdAccount => console.log('Created Account:', createdAccount))
 * .catch(error => console.error('Error creating account:', error));
 *
 * @example
 * // Create a new opportunity record with a topic and potential customer, and expand the potential customer's name in the returned record.
 * const newOpportunity = { topic: 'New Software License Sale', customerid_account: 'c7b6a5e4-f3d2-1a90-8765-43210fedcba9' };
 * postRecord('opportunities', newOpportunity, '$expand=customerid_account($select=name)')
 * .then(createdOpportunity => console.log('Created Opportunity:', createdOpportunity))
 * .catch(error => console.error('Error creating opportunity:', error));
 */
export declare function postRecord(entitySetName: string, value: DataverseRecord, query?: string): Promise<DataverseRecord>;

/**
 * Creates a new record in the specified Dataverse entity set and returns the ID of the newly created record.
 *
 * @param entitySetName - The logical name of the entity set where the record will be created (e.g., 'accounts', 'contacts').
 * @param value - An object representing the data for the new record. The keys of this object should correspond to the schema names of the entity's attributes.
 * @returns A promise that resolves to the GUID (string) of the newly created record.
 *
 * @example
 * // Create a new account record with the name 'Contoso Ltd.'
 * const newAccount = { name: 'Contoso Ltd.' };
 * postRecordGetId('accounts', newAccount)
 * .then(accountId => console.log('New Account ID:', accountId))
 * .catch(error => console.error('Error creating account:', error));
 *
 * @example
 * // Create a new contact record with a first name, last name, and email address.
 * const newContact = { firstname: 'John', lastname: 'Doe', emailaddress1: 'john.doe@example.com' };
 * postRecordGetId('contacts', newContact)
 * .then(contactId => console.log('New Contact ID:', contactId))
 * .catch(error => console.error('Error creating contact:', error));
 */
export declare function postRecordGetId(entitySetName: string, value: DataverseRecord): Promise<GUID>;

/**
 * A factory function to create a new PrimaryKeyProperty instance.
 *
 * @param name The name of the primary key property.
 * @returns A new PrimaryKeyProperty instance.
 */
export declare function primaryKey(name: string): PrimaryKeyProperty;

/**
 * Represents the primary key property within a dataverse schema.
 * Extends the base Property class with a GUID type and is set to read-only by default.
 */
export declare class PrimaryKeyProperty extends Schema<GUID> {
    /**
     * The kind of schema element for a primary key property, which is "value".
     */
    kind: "value";
    /**
     * The type of the property, which is "primaryKey".
     */
    type: "primaryKey";
    /**
     * Creates a new PrimaryKeyProperty instance.
     * Sets the property to read-only upon creation.
     *
     * @param name The name of the primary key property (typically the logical name of the primary key attribute).
     */
    constructor(name: string);
}

export declare type Primitive = string | number | boolean | null;

export declare type Query = {
    select?: string;
    expand?: string;
    orderby?: string;
    filter?: string;
    top?: number;
    apply?: string;
};

/**
 * Constructs an OData query string from a query object.
 *
 * @param query An object containing OData query parameters.
 * @returns An OData query string.
 *
 * @example
 * // Simple query with select and filter:
 * query({
 * select: "id,name,email",
 * filter: "age gt 20"
 * });
 * // returns "$select=id,name,email&$filter=age gt 20"
 *
 * // Query with expand and orderby:
 * query({
 * expand: "orders($select=id,orderDate)",
 * orderby: "name asc"
 * });
 * // returns "$expand=orders($select=id,orderDate)&$orderby=name asc"
 *
 * // Query with top:
 * query({ top: 10 });
 * // returns "$top=10"
 */
export declare function query(query?: Query): string;

export declare type QueryForTable<T> = {
    orderby?: Partial<Record<keyof T, "asc" | "desc">>;
    filter?: string;
    top?: number;
};

/**
 * Creates a validator function that checks if a value is required (not null or undefined).
 *
 * @returns A validator function that returns "Required" if the value is null or undefined, otherwise undefined.
 *
 * @example
 * // Create a required validator:
 * const isRequired = required();
 *
 * // Validate a value:
 * isRequired("hello"); // returns undefined (valid)
 * isRequired(null);    // returns "Required" (invalid)
 * isRequired(undefined); // returns "Required" (invalid)
 */
export declare function required(): (v: any) => "Required" | undefined;

/**
 * Retrieves the roles assigned to a user in Azure Active Directory (AAD).
 *
 * @param aadId - The AAD Directory Object ID of the user whose roles need to be fetched.
 * @returns  A promise that resolves to a Set of role names associated with the user.
 */
export declare function RetrieveAadUserRoles(aadId: string): Promise<Set<string>>;

/**
 * Retrieves the total record count for a specific entity in the system.
 *
 * @param  logicalName - The logical name of the entity whose total record count is to be fetched.
 * @returns  A promise that resolves to the total record count for the specified entity.
 */
export declare function RetrieveTotalRecordCount(logicalName: string): Promise<number>;

/**
 * Represents a generic property within a dataverse schema.
 * Implements the StandardSchemaV1 interface.
 *
 * @template T The type of the property's value.
 */
declare class Schema<T> implements StandardSchemaV1<T> {
    #private;
    name: string;
    kind: string;
    type: string;
    /**
     * Creates a new Property instance.
     *
     * @param name The name of the property.
     * @param defaultValue The default value for the property.
     */
    constructor(name: string, defaultValue: T);
    /**
     * Sets the default value of the property.
     *
     * @param value The new default value.
     * @returns The Property instance for chaining.
     */
    setDefault(value: T): this;
    /**
     * Gets the default value of the property.
     *
     * @returns The default value.
     */
    getDefault(): T;
    /**
     * Sets whether the property is read-only.
     *
     * @param [value=true] True if the property should be read-only, false otherwise. Defaults to true.
     * @returns The Property instance for chaining.
     */
    setReadOnly(value?: boolean): this;
    /**
     * Gets whether the property is read-only.
     *
     * @returns True if the property is read-only, false otherwise.
     */
    getReadOnly(): boolean;
    /**
     * Adds a validator to the property.
     *
     * @param v The validator function or object to add.
     * @returns The Property instance for chaining.
     */
    check(v: Validator<T>): this;
    /**
     * Adds a required validator to the property.
     *
     * @returns The Property instance for chaining.
     */
    required(): this;
    /**
     * Transforms a value received from Dataverse into the property's type.
     * By default, it returns the value as is. Subclasses can override this for custom transformations.
     *
     * @param value The value received from Dataverse.
     * @returns The transformed value of type T.
     */
    transformValueFromDataverse(value: any): T;
    /**
     * Transforms the property's value into a format suitable for sending to Dataverse.
     * By default, it returns the value as is. Subclasses can override this for custom transformations.
     *
     * @param value The property's value.
     * @returns The transformed value suitable for Dataverse.
     */
    transformValueToDataverse(value: any): any;
    getIssues(value: unknown, path?: PropertyKey[]): StandardSchemaV1.Issue[];
    validate(value: unknown, path?: PropertyKey[]): StandardSchemaV1.Result<T>;
    parse(value: unknown): T;
    /**
     * Provides access to the standard schema properties for this property.
     * This is a computed property.
     *
     * @returns An object containing the standard schema properties, including version, vendor, and a validation function.
     */
    get ["~standard"](): StandardSchemaV1.Props<T>;
}

/**
 * Creates an OData $select expression.
 *
 * @param values An array of property names to select.
 * @returns A comma-separated string of property names.
 *
 * @example
 * // Select multiple properties:
 * $select("id", "name", "email");
 * // returns "id,name,email"
 *
 * // Select properties including nested properties
 * $select("id", "name", "address/city");
 * // returns "id,name,address/city"
 */
export declare function select(...values: string[]): string;

/**
 * Sets the global configuration for the application, including the base URL and default headers.
 *
 * @param config The configuration object to set.  The headers are merged with the existing global headers.
 *
 * @example
 * // Set a new base URL:
 * setConfig({ url: "/newapi/data/v9.2" });
 *
 * // Add a custom header:
 * setConfig({ headers: { "X-Custom-Header": "MyValue" } });
 */
export declare function setConfig(config: Config): void;

/** The Standard Schema interface. */
export declare interface StandardSchemaV1<Input = unknown, Output = Input> {
    /** The Standard Schema properties. */
    readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
    /** The Standard Schema properties interface. */
    export interface Props<Input = unknown, Output = Input> {
        /** The version number of the standard. */
        readonly version: 1;
        /** The vendor name of the schema library. */
        readonly vendor: string;
        /** Validates unknown input values. */
        readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
        /** Inferred types associated with the schema. */
        readonly types?: Types<Input, Output> | undefined;
    }
    /** The result interface of the validate function. */
    export type Result<Output> = SuccessResult<Output> | FailureResult;
    /** The result interface if validation succeeds. */
    export interface SuccessResult<Output> {
        /** The typed output value. */
        readonly value: Output;
        /** The non-existent issues. */
        readonly issues?: undefined;
    }
    /** The result interface if validation fails. */
    export interface FailureResult {
        /** The issues of failed validation. */
        readonly issues: ReadonlyArray<Issue>;
    }
    /** The issue interface of the failure output. */
    export interface Issue {
        /** The error message of the issue. */
        readonly message: string;
        /** The path of the issue, if any. */
        readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
    }
    /** The path segment interface of the issue. */
    export interface PathSegment {
        /** The key representing a path segment. */
        readonly key: PropertyKey;
    }
    /** The Standard Schema types interface. */
    export interface Types<Input = unknown, Output = Input> {
        /** The input type of the schema. */
        readonly input: Input;
        /** The output type of the schema. */
        readonly output: Output;
    }
    /** Infers the input type of a Standard Schema. */
    export type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["input"];
    /** Infers the output type of a Standard Schema. */
    export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}

/**
 * Creates an OData filter condition using the "startswith" operator.
 * Checks if a string property starts with a specified substring.
 *
 * @param name The name of the string property to check.
 * @param value The substring to search for at the beginning of the property's value.
 * @returns A string representing the "startswith" filter condition.
 *
 * @example
 * startsWith("name", "A"); // returns "startswith(name,'A')"
 *
 * // Example: Combining with and
 * and(startsWith("name", "A"), lessThan("age", 20));
 * // returns "startswith(name,'A') and (age lt 20)"
 */
export declare function startsWith(name: string, value: Primitive): string;

/**
 * A factory function to create a new StringProperty instance.
 *
 * @param name The name of the string property.
 * @returns A new StringProperty instance.
 */
export declare function string(name: string): StringProperty;

/**
 * Represents a string property within a dataverse schema.
 * Extends the base Property class with a string or null type and a default value of null.
 */
export declare class StringProperty extends Schema<string | null> {
    /**
     * The kind of schema element for a string property, which is "value".
     */
    kind: "value";
    /**
     * The type of the property, which is "string".
     */
    type: "string";
    /**
     * Creates a new StringProperty instance.
     *
     * @param name The name of the string property.
     */
    constructor(name: string);
}

/**
 * Creates an OData aggregation expression for calculating the sum of a property.
 *
 * @param name The name of the property to sum.
 * @param alias The alias for the resulting sum value (defaults to the property name).
 * @returns An OData aggregation expression string for sum.
 *
 * @example
 * sum("quantity");           // returns "quantity with sum as quantity"
 * sum("quantity", "total"); // returns "quantity with sum as total"
 */
export declare function sum(name: string, alias?: string): string;

/**
 * Represents a Dataverse table and provides methods for interacting with it.
 * Implements the StandardSchemaV1 interface.
 *
 * @template TProperties An object defining the properties of the table.  Each property definition
 * describes the type and behavior of a column in the Dataverse table.
 */
export declare class Table<TProperties extends GenericProperties> extends Schema<Infer<TProperties>> {
    properties: TProperties;
    kind: "table";
    type: "table";
    /**
     * Creates a new Table instance.
     *
     * @param entitySetName The entity set name of the Dataverse table.
     * @param props An object defining the properties of the table.
     */
    constructor(entitySetName: string, props: TProperties);
    getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[];
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
    getDefault(value?: Partial<Infer<TProperties>>): Infer<TProperties>;
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
    getRecord(id: DataverseKey): Promise<Infer<TProperties> | null>;
    getAlternateKeys(value: Partial<Infer<TProperties>>): AlternateKey;
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
    getRecords(query?: QueryForTable<TProperties>): Promise<Infer<TProperties>[]>;
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
    getPropertyValue<TKey extends keyof TProperties>(key: TKey, id: DataverseKey, query?: QueryForTable<TProperties>): Promise<Infer<TProperties[TKey]>>;
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
    updatePropertyValue<TKey extends keyof TProperties>(key: TKey, id: DataverseKey, value: Infer<TProperties[TKey]>): Promise<DataverseKey>;
    /**
     * Handles updating navigation properties (lookups, expands, collections, lookups).
     * @param property The navigation property to update
     * @param id The id of the record being updated.
     * @param value The new value for the navigation property.
     */
    protected updateNavigationProperty(property: GenericNavigationProperty, id: DataverseKey, value: any): Promise<`${string}-${string}-${string}-${string}-${string}` | `${string}=${string}` | DataverseKey[] | undefined>;
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
    associateRecord<TKey extends NarrowKeysByValue<TProperties, GenericNavigationProperty>>(key: TKey, id: DataverseKey, childId: DataverseKey): Promise<DataverseKey>;
    /**
     * Dissociates a child record from a parent record through a navigation property.
     *
     * @param key The key of the navigation property to use for the disassociation.
     * @param id The unique identifier of the parent record.
     * @param childId The unique identifier of the child record to dissociate (only for collection-valued navigation properties).
     * @returns A promise that resolves to the ID of the parent record.
     *
     * @example
     * // Dissociate a contact from an account's primary contact
     * await myAccountTable.dissociateRecord("primarycontactid", accountId);
     *
     * // Dissociate a contact from an account's contact collection
     * await myAccountTable.dissociateRecord("contact_customer_accounts", accountId, contactId);
     */
    dissociateRecord<TKey extends NarrowKeysByValue<TProperties, CollectionProperty<any> | CollectionIdsProperty>>(key: TKey, id: DataverseKey, childId: DataverseKey): Promise<DataverseKey>;
    dissociateRecord<TKey extends NarrowKeysByValue<TProperties, LookupProperty<any> | LookupIdProperty>>(key: TKey, id: DataverseKey): Promise<DataverseKey>;
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
    saveRecord(value: Partial<Infer<TProperties>>): Promise<GUID>;
    /**
     * Deletes a record from the table by its ID.
     *
     * @param id The unique identifier of the record to delete.
     * @returns A promise that resolves to the ID of the deleted record.
     *
     * @example
     * await myAccountTable.deleteRecord("12345678-90ab-cdef-1234-567890abcdef");
     */
    deleteRecord(id: DataverseKey): Promise<DataverseKey>;
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
    deletePropertyValue<TKey extends NarrowKeysByValue<TProperties, GenericValueProperty>>(key: TKey, id: DataverseKey): Promise<DataverseKey>;
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
    getPrimaryKey(): {
        key: string;
        property: PrimaryKeyProperty;
    };
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
    getPrimaryId(value: Partial<Infer<TProperties>>): GUID | undefined;
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
    transformValueFromDataverse(value: any): Infer<TProperties>;
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
    transformValueToDataverse(value: Partial<Infer<TProperties>>): DataverseRecord;
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
    pickProperties<TKeys extends keyof TProperties>(...keys: TKeys[]): Table<Pick<TProperties, TKeys>>;
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
    omitProperties<TKeys extends keyof TProperties>(...keys: TKeys[]): Table<Omit<TProperties, TKeys>>;
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
    appendProperties<TAppendedProperties extends GenericProperties>(properties: TAppendedProperties): Table<Omit<TProperties, keyof TAppendedProperties> & TAppendedProperties>;
}

export declare function table<TProperties extends GenericProperties>(name: string, properties: TProperties): Table<TProperties>;

/**
 * Generates a query expression for the "ThisFiscalPeriod" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "ThisFiscalPeriod" operator.
 */
export declare function ThisFiscalPeriod(name: string): string;

/**
 * Generates a query expression for the "ThisFiscalYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "ThisFiscalYear" operator.
 */
export declare function ThisFiscalYear(name: string): string;

/**
 * Generates a query expression for the "ThisMonth" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "ThisMonth" operator.
 */
export declare function ThisMonth(name: string): string;

/**
 * Generates a query expression for the "ThisWeek" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "ThisWeek" operator.
 */
export declare function ThisWeek(name: string): string;

/**
 * Generates a query expression for the "ThisYear" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "ThisYear" operator.
 */
export declare function ThisYear(name: string): string;

/**
 * Converts a File object to a base64 encoded string.
 *
 * @param file The File object to convert.
 * @returns A promise that resolves to the base64 encoded string, or rejects with an error.
 *
 * @example
 * // Convert a file to base64:
 * const myFile = document.getElementById('myFile').files[0];
 * toBase64(myFile)
 * .then(base64String => console.log(base64String))
 * .catch(error => console.error(error));
 */
export declare function toBase64(file: File): Promise<unknown>;

/**
 * Generates a query expression for the "Today" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "Today" operator.
 */
export declare function Today(name: string): string;

/**
 * Generates a query expression for the "Tomorrow" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "Tomorrow" operator.
 */
export declare function Tomorrow(name: string): string;

/**
 * Performs a fetch request and handles common response processing, including JSON parsing,
 * error handling, and special handling for 204 No Content responses.
 *
 * @param url The URL to fetch.
 * @param init Optional fetch options.
 * @returns A promise that resolves to the JSON data if the response is JSON,
 * the extracted entity ID from the OData-EntityId header for 204 responses,
 * the response text for non-JSON responses, or void if 204 and no entity ID.
 * @throws An error if the response status is not ok or if an error is present in the JSON data.
 *
 * @example
 * // Fetch JSON data:
 * tryFetch("/api/data/v9.2/accounts/12345")
 * .then(data => console.log(data))
 * .catch(error => console.error(error));
 *
 * // Fetch with custom headers:
 * tryFetch("/api/data/v9.2/accounts", {
 * headers: { "Prefer": "odata.include-annotations=*" }
 * })
 * .then(data => console.log(data))
 * .catch(error => console.error(error));
 */
export declare function tryFetch(url: RequestInfo | URL, init?: RequestInit): Promise<any>;

/**
 * Generates a query expression for the "Under" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The value to compare.
 * @returns {string} The query expression for the "Under" operator.
 */
export declare function Under(name: string, value: string): string;

/**
 * Generates a query expression for the "UnderOrEqual" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @param {string} value - The value to compare.
 * @returns {string} The query expression for the "UnderOrEqual" operator.
 */
export declare function UnderOrEqual(name: string, value: string): string;

/**
 * Updates the value of a single property of an existing Dataverse record.
 *
 * @param entitySetName - The logical name of the entity set where the record is located (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record to update.
 * @param propertyName - The name of the property to update (e.g., 'name', 'emailaddress1').
 * @param value - The new primitive value for the property (e.g., a string, number, or boolean).
 * @returns A promise that resolves to the ID of the updated record upon successful update.
 *
 * @example
 * // Update the 'name' property of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef' to 'New Account Name'.
 * updatePropertyValue('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'name', 'New Account Name')
 * .then(updatedAccountId => console.log('Updated Account ID:', updatedAccountId))
 * .catch(error => console.error('Error updating account name:', error));
 *
 * @example
 * // Update the 'emailaddress1' property of the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210' to 'updated.email@example.com'.
 * updatePropertyValue('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210', 'emailaddress1', 'updated.email@example.com')
 * .then(updatedContactId => console.log('Updated Contact ID:', updatedContactId))
 * .catch(error => console.error('Error updating contact email:', error));
 */
export declare function updatePropertyValue(entitySetName: string, id: DataverseKey, propertyName: string, value: Primitive): Promise<DataverseKey>;

export declare type Validator<T> = (value: T) => void | undefined | string;

/**
 * Retrieves the identity information of the currently authenticated user.
 *
 * @returns A promise that resolves to an object containing the BusinessUnitId, UserId, and OrganizationId
 * of the currently authenticated user.
 */
export declare function WhoAmI(): Promise<{
    BusinessUnitId: GUID;
    UserId: GUID;
    OrganizationId: GUID;
}>;

/**
 * Wraps a value in single quotes if it's a string, otherwise converts it to a string.
 * This is used to properly format values in OData queries.
 *
 * @param value The value to wrap.
 * @returns The value wrapped in single quotes if it's a string, or its string representation otherwise.
 *
 * @example
 * wrapString("hello"); // returns "'hello'"
 * wrapString(123);     // returns "123"
 */
export declare function wrapString(value: any): string;

/**
 * Creates an XML string from a template string array, removing unnecessary whitespace.
 *
 * @param raw The template string array.
 * @param values The values to interpolate into the template string.
 * @returns A compact XML string.
 *
 * @example
 * // Create a simple XML string:
 * const myXml = xml`
 * <root>
 * <element>Hello</element>
 * </root>
 * `;
 * // returns "<root><element>Hello</element></root>"
 */
export declare function xml(raw: TemplateStringsArray, ...values: unknown[]): string;

/**
 * Generates a query expression for the "Yesterday" operator in Microsoft Dynamics CRM.
 *
 * @param {string} name - The name of the property.
 * @returns {string} The query expression for the "Yesterday" operator.
 */
export declare function Yesterday(name: string): string;

export { }
