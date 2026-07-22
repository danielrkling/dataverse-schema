import * as v from "valibot"
import type { DataverseClient } from "./client"
import type { DataverseTable } from "./table"

export type ValidationSchema<T> = v.BaseSchema<T, T, v.BaseIssue<unknown>>

export type FieldOptions<T> = {
  default?: T
  readonly?: boolean
  schema?: ValidationSchema<T>
}

export const SKIP = Symbol("skip")

export type TransformContext = {
  table: DataverseTable<any>
  client: DataverseClient
  recordId: string
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

  transformValueFromDataverse(value: any, ctx?: TransformContext): T {
    return value
  }

  transformValueToDataverse(value: any, ctx?: TransformContext): any {
    return value
  }

  afterSave?(ctx: TransformContext, value: any): Promise<void>
}
