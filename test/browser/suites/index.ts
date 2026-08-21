import { Suite } from "../harness/runner"
import { generalSuite } from "./general"
import { crudSuite } from "./crud"
import { odataSuite } from "./query-odata"
import { fetchxmlSuite } from "./query-fetchxml"
import { navigationSuite } from "./navigation"
import { filesSuite } from "./files-images"
import { functionsSuite } from "./functions-actions"
import { bulkSuite } from "./bulk"
import { errorsSuite } from "./errors"

export const suites: Suite[] = [
  generalSuite,
  crudSuite,
  odataSuite,
  fetchxmlSuite,
  navigationSuite,
  filesSuite,
  functionsSuite,
  bulkSuite,
  errorsSuite,
]
