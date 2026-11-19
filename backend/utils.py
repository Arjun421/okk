"""Plain helpers for the mixed_shop sample. No cloud SDK here."""


def chunked(items, size):
    """Split a list into chunks of the given size."""
    return [items[i:i + size] for i in range(0, len(items), size)]


def order_total(lines):
    """Sum quantity times price over order lines."""
    total = 0
    for line in lines:
        total += line["quantity"] * line["price"]
    return round(total, 2)


def customer_names(customers):
    """Return customer names, sorted."""
    return sorted(c["name"] for c in customers)


def retry_count(attempts):
    """Count down remaining retries."""
    remaining = attempts
    while remaining > 0:
        remaining -= 1
    return remaining
