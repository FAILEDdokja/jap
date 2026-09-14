-- A provisional intake must not invent clinical demographics. Registered
-- patients remain validated by the API before this transition is allowed.
ALTER TABLE "patients" ALTER COLUMN "gender" DROP NOT NULL;
ALTER TABLE "patients" ALTER COLUMN "dob" DROP NOT NULL;
