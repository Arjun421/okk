const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");

const ddb = new DynamoDBClient({});

async function loadLegacyOrders(ids) {
  const orders = [];
  for (const id of ids) {
    const res = await ddb.send(new GetItemCommand({ TableName: "orders", Key: { order_id: { S: id } } }));
    orders.push(res.Item);
  }
  return orders;
}

module.exports = { loadLegacyOrders };
