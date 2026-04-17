-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "calendarProvider" TEXT,
    "linkedUserId" TEXT,
    "city" TEXT,
    "company" TEXT,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contacts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_contacts" ("calendarProvider", "createdAt", "email", "id", "linkedUserId", "name", "ownerId", "updatedAt") SELECT "calendarProvider", "createdAt", "email", "id", "linkedUserId", "name", "ownerId", "updatedAt" FROM "contacts";
DROP TABLE "contacts";
ALTER TABLE "new_contacts" RENAME TO "contacts";
CREATE UNIQUE INDEX "contacts_ownerId_email_key" ON "contacts"("ownerId", "email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
