---
title: Profile
summary: Your name, sign-in email and password, and where you sign out.
status: written
updated: 2026-10-14
roles: All roles
related: account-and-settings/settings
---

<!-- Written 2026-10-14 from the code (app/account/profile/page.tsx) and by doing each task on the test system as a
     User. The test system has no mail server, so no email arrived there. -->

Open it from the portal's sidebar: **Account** › **Profile**. The card **Account** has your display name, sign-in
email, password, role and user ID. Your role is set by an admin, in **Admin** › **Users**.

## Change your display name
Roles: All roles
Choose the name the portal shows instead of your email address.

1. Under **Display name**, type your name in **Your name**.
2. Press **Save**. It shows only when the name has changed.
3. Read the message: **Name saved**.

The sidebar shows the new name after you reload the page.

To show your email again, empty the box and press **Save**. The sidebar may keep the old name until you close the
browser tab.

:::example A display name
Your name: `Alice Example`
:::

## Change your sign-in email
Roles: All roles
Change the address you sign in with.

1. Under **Sign-in email**, press **Change**.
2. Type the new address in **New address**.
3. Press **Send confirmation**.
4. Open the email that arrives at the new address, and press its link.
   Unverified: The email and its link. The test system has no mail server. There the page said **Error sending email
   change email**.

Until you confirm, you sign in with the old address.

Unverified: The email and its link, in step 4.

:::example A new address
New address: `alice.example@example.com`
:::

## Change your password
Roles: All roles
Set a new password, through a link sent to your email.

1. Under **Password**, press **Change password**.
2. Type your **Current password**. If it is wrong, the page says **That isn't your current password.**
3. Press **Check and send the link**. The page says **Check your email**, with your address.
4. Open the email, and press its link. The page **Set a new password** opens.
   Unverified: The email and the page it opens. The test system has no mail server.
5. Type the **New password**: at least 8 characters.
6. Type it again in **Confirm new password**.
7. Press **Update password**. The page says **Password updated**.

If the email cannot be sent, the page says **The email could not be sent**, and what to do instead.

Unverified: Steps 4 to 7. The test system has no mail server.

## Copy your user ID
Roles: All roles
Copy the ID a developer may ask for when you report a problem.

1. Find **User ID** on the card.
2. Press **Copy your user ID**. A message says **User ID copied**.

## Sign out
Roles: All roles
End your session on this computer.

1. Press **Sign out**, at the bottom of the page. Or press **Account** › **Sign out** in the sidebar. The sign-in page
   opens.

Your theme, pinned pages and dashboard layout stay with your account.
