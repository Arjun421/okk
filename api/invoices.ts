import { HttpRequest, InvocationContext } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient, OperationInput } from "@azure/cosmos";

const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION_STRING ?? ""); // ok: module-level client
const container = cosmos.database("shop").container("invoices");

export async function saveInvoices(request: HttpRequest, context: InvocationContext) {
  const blobService = BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION_STRING ?? ""); // smell: CS-004
  const containerClient = blobService.getContainerClient("invoices");
  const invoices = (await request.json()) as { id: string; pdf: string }[];
  for (const invoice of invoices) {
    const body = invoice.pdf;
    await containerClient.getBlockBlobClient(`${invoice.id}.pdf`).upload(body, body.length); // smell: CS-001
  }
  context.log(`saved ${invoices.length} invoices`);
  return { status: 200 };
}

export async function loadInvoices(ids: string[]) {
  const invoices = [];
  for (const id of ids) {
    const { resource } = await container.item(id, id).read(); // smell: CS-001
    invoices.push(resource);
  }
  return invoices;
}

export async function firstInvoices() {
  const { resources } = await container.items.query("SELECT * FROM c").fetchNext(); // smell: CS-003
  return resources;
}

export async function allInvoices() {
  const { resources } = await container.items.query("SELECT * FROM c").fetchAll(); // ok: fetchAll reads every page
  return resources;
}

export async function createInvoices(invoices: { id: string; total: number }[]) {
  const operations: OperationInput[] = invoices.map((invoice) => ({ operationType: "Create", resourceBody: invoice }));
  return container.items.bulk(operations); // ok: bulk API
}
