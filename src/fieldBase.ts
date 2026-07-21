import * as v from "valibot"

export type ValidationSchema<T> = v.BaseSchema<T, T, v.BaseIssue<unknown>>

export type FieldOptions<T> = {
  default?: T
  readonly?: boolean
  schema?: ValidationSchema<T>
}

export abstract class FieldBase<T> {
  name: string
  fromDataverseName: string
  toDataverseName: string
  kind!: string
  type!: string
  schema: ValidationSchema<T>

  #default: T
  #readOnly: boolean

  constructor(name: string, defaults: { defaultValue: T; schema: ValidationSchema<T> }, options?: FieldOptions<T>) {
    this.name = name
    this.fromDataverseName = name
    this.toDataverseName = name
    this.#default = options?.default ?? defaults.defaultValue
    this.#readOnly = options?.readonly ?? false
    this.schema = options?.schema ?? defaults.schema
  }

  getDefault(): T {
    return this.#default as T
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
