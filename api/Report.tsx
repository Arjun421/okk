import React from "react";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({}); // ok: module-level client

export function OrderReport({ ids }: { ids: string[] }) {
  ids.forEach((id) => ddb.send(new GetItemCommand({ TableName: "orders", Key: { order_id: { S: id } } }))); // smell: CS-001
  return <ul>{ids.map((id) => <li key={id}>{id}</li>)}</ul>;
}
