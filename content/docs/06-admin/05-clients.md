---
title: Clients
summary: Operators and brokers who sign in to see their own flights — approve a request, set what exists for them and what they see, change it, end it.
status: written
roles: Admin and Developer (the Clients action in Permissions)
updated: 2026-10-25
related: admin/users, admin/permissions, digital-wall/flights
---

<!-- Written 2026-10-25 from the code (app/admin/clients, lib/clients) and by doing each task on the test system. -->

Open it from the portal's sidebar: **Admin** › **Clients**. A client is a person outside Clearway — an operator or a
broker — who asked for access from the sign-in page. Two things are kept apart: **scope** decides which flights exist
for them, anywhere in the product; **access** decides what they see of those flights. Every decision is logged.

[screenshot: admin-clients | Clients: who is waiting, who is approved with their scope and switches, and the decision log.]

## Review a request
Requests arrive from **Ask for access** on the sign-in page, with the person's name, company and work email, and a note.

1. Under **Waiting for a decision**, read the request. The company name is the one to recognise; the note may say who at
   the operator can confirm them, or which flights they handle.
2. Press **Review**. The editor opens in the row.
3. **Scope · which flights exist for them.** A request carries a company name only, so the scope starts empty. Add a
   **Leon operator** (every flight of that operator), an **aircraft registration** (every flight of that aircraft) or a
   **trip number** (only those trips). Any mix. A suggestion appears when a Leon operator has the same name as the
   company. The line under the list counts the flights that match in the next 7 days.
   Note: without a scope the client sees no flights, and **Approve** stays disabled.
4. **Access · what they see of those flights.** The starting set is on: Flight board, Weather, NOTAM information,
   Flight radar. Turn the others on as needed: Service status, NOTAM check status, Documents, Airport & AIP search,
   Limitations, Important notices, CAA details. **Flight board is required.**
5. **Passenger details**, apart from the rest: **Off**, **Names and seats**, or **Names and documents**. Documents
   open one passenger at a time, close after 30 seconds and are logged — choosing it asks you to confirm the client is
   the operator, or that written consent is held.
6. Read the summary line — it says what the client will see — and press **Approve …**. The client gets an email and
   can sign in at once.

To turn a request down, press **Refuse** and write a note the person will see on their page.

## Change a client
Roles: Admin and Developer by default

1. Under **Approved clients**, find the row. Reading across shows one client: scope chips, the eleven dots (filled for
   on), the passenger chip, when and by whom they were granted.
2. Press **Change**. The same editor opens with their current scope and switches; what you change is marked **CHANGED**
   and the footer lists the difference.
3. Press **Save changes**. The services see it within ten seconds; the client sees it the next time they load a page.

Note: removing one trip from the scope takes its flights away at once and can be added back. That is the way to stop
one trip, not **Remove access**.

## Remove access
Roles: Admin and Developer by default

1. Open **Change** on the client and press **Remove access**.
2. Read what happens: they are signed out on every device now, their scope and switches are emptied, and to come back
   they ask again and are approved from scratch. The record itself stays, so who had what and when can always be
   answered.
3. Type the company name exactly and press **Remove access**. The client gets an email saying their access has ended.

## The decision log
Every approval, change, passenger-level change, refusal and removal is a row: what changed, by whom, when (UTC), and the
note if there was one. Newest first.

## What a client never has
The Ops Agent, Flight intake, Admin, Developer, Users and Permissions are not switches and do not appear on this page or
anywhere a client can see. A client asking for a flight outside their scope — through their pages or straight at the
server — gets "That is not on your account", never a hint that the flight exists.
