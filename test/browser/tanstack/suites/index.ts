import { Suite } from "../../harness/runner"
import { onlineCollectionSuite } from "./online-collection"
import { offlineQueueSuite } from "./offline-queue"
import { crossTabSuite } from "./cross-tab"
import { durabilitySuite } from "./durability"

export const suites: Suite[] = [
  onlineCollectionSuite,
  offlineQueueSuite,
  crossTabSuite,
  durabilitySuite,
]
