import { expect, test, } from "vitest";
import { number, primaryKey, setConfig, string, table } from "../src";


setConfig({
    url: "https://services.odata.org/TripPinRESTierService",
    headers:{

    }
})

const People = table("People", {
  id: primaryKey("UserName"),
  firstName: string("FirstName")
});




