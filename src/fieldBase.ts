import * as v from "valibot"

export type ValidationSchema<T> = v.BaseSchema<T, T, v.BaseIssue<unknown>>

export abstract class FieldBase<T> {
  name: string
  fromDataverseName: string
  toDataverseName: string
  kind: string
  type: string

  #default: T
  #readOnly = false
  schema: ValidationSchema<T>

  constructor(options: {
    name: string
    defaultValue: T
    kind: string
    type: string
    schema: ValidationSchema<T>
  }) {
    this.name = options.name
    this.fromDataverseName = options.name
    this.toDataverseName = options.name
    this.#default = options.defaultValue
    this.kind = options.kind
    this.type = options.type
    this.schema = options.schema
  }

  setDefault(value: T): this {
    this.#default = value
    return this
  }

  getDefault(): T {
    return this.#default as T
  }

  setReadOnly(value: boolean = true): this {
    this.#readOnly = value
    return this
  }

  getReadOnly(): boolean {
    return this.#readOnly
  }

  transformValueFromDataverse(value: any): T {
    return value
  }

  transformValueToDataverse(value: any): any {
    return value
  }
}
