# Security Specification - ConnectFlow Sales Pro

## Data Invariants
1. Customers, Appointments, and FollowUps must always be owned by a specific Sales Rep (`salesRepId`).
2. A Sales Rep can only read and write their own data.
3. Appointments and FollowUps must reference a valid Customer.
4. Timestamps (`createdAt`, `dateTime`, `dueDateTime`) must be reasonable.
5. Status fields must follow predefined enums.

## The "Dirty Dozen" Payloads (Deny Cases)
1. **Identity Theft**: Creating a Customer with someone else's `salesRepId`.
2. **Access Breach**: Reading a Customer that belongs to another Sales Rep.
3. **Ghost Fields**: Creating a Customer with an extra field `isAdmin: true`.
4. **ID Poisoning**: Using a 1MB string as a Customer ID.
5. **Orphan Writing**: Creating an Appointment for a Customer that doesn't exist.
6. **State Skipping**: Manually setting a FollowUp to `completed` while creating it (if logic says it must start as `pending`).
7. **Timestamp Spoofing**: Setting `createdAt` to a future date instead of `request.time`.
8. **Privilege Escalation**: Updating the `salesRepId` of an existing document to transfer ownership.
9. **Bulk Scrape**: Querying all Customers without a `where('salesRepId', '==', uid)` filter.
10. **Type Injection**: Setting `phone` as a list of numbers instead of a string.
11. **Size Bomb**: Setting a `notes` field to 10MB of text.
12. **Immutable Break**: Changing the `customerId` of an Appointment after it has been created.

## Implementation Strategy
- Use `isValidId(id)` for all document IDs.
- Use `isValidEntity(data)` helpers for all writes.
- Use `affectedKeys().hasOnly()` for updates.
- Enforce `salesRepId == request.auth.uid`.
- Use `get()` to verify relational consistency on creation.
