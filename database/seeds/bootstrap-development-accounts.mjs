import argon2 from "argon2";
import pg from "pg";

const { Client } = pg;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error("MIGRATION_DATABASE_URL is required.");
}

const accounts = [
  {
    id: "20000000-0000-4000-a000-000000000001",
    email: "global.admin@example.test",
    displayName: "Global Administrator",
    passwordVariable: "DEV_GLOBAL_ADMIN_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000001", "org-a", "GLOBAL_ADMIN", true],
      ["21000000-0000-4000-a000-000000000002", "org-b", "GLOBAL_ADMIN", false],
      ["21000000-0000-4000-a000-000000000003", "org-c", "GLOBAL_ADMIN", false],
      ["21000000-0000-4000-a000-000000000004", "org-d", "GLOBAL_ADMIN", false],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000002",
    email: "orga.admin@example.test",
    displayName: "Org A Administrator",
    passwordVariable: "DEV_ORG_A_ADMIN_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000005", "org-a", "ORG_ADMIN", true],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000003",
    email: "orgb.admin@example.test",
    displayName: "Org B Administrator",
    passwordVariable: "DEV_ORG_B_ADMIN_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000006", "org-b", "ORG_ADMIN", true],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000004",
    email: "orgc.admin@example.test",
    displayName: "Org C Administrator",
    passwordVariable: "DEV_ORG_C_ADMIN_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000007", "org-c", "ORG_ADMIN", true],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000005",
    email: "orgd.admin@example.test",
    displayName: "Org D Administrator",
    passwordVariable: "DEV_ORG_D_ADMIN_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000008", "org-d", "ORG_ADMIN", true],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000006",
    email: "orgb.restricted@example.test",
    displayName: "Org B Restricted Viewer",
    passwordVariable: "DEV_ORG_B_RESTRICTED_PASSWORD",
    memberships: [
      [
        "21000000-0000-4000-a000-000000000009",
        "org-b",
        "RESTRICTED_VIEWER",
        true,
      ],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000007",
    email: "orga.analyst@example.test",
    displayName: "Org A Analyst",
    passwordVariable: "DEV_ORG_A_ANALYST_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000010", "org-a", "ANALYST", true],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000008",
    email: "orga.viewer@example.test",
    displayName: "Org A Viewer",
    passwordVariable: "DEV_ORG_A_VIEWER_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000011", "org-a", "VIEWER", true],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000009",
    email: "orgb.analyst@example.test",
    displayName: "Org B Analyst",
    passwordVariable: "DEV_ORG_B_ANALYST_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000012", "org-b", "ANALYST", true],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000010",
    email: "orgb.viewer@example.test",
    displayName: "Org B Viewer",
    passwordVariable: "DEV_ORG_B_VIEWER_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000013", "org-b", "VIEWER", true],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000011",
    email: "orgc.analyst@example.test",
    displayName: "Org C Analyst",
    passwordVariable: "DEV_ORG_C_ANALYST_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000014", "org-c", "ANALYST", true],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000012",
    email: "orgc.viewer@example.test",
    displayName: "Org C Viewer",
    passwordVariable: "DEV_ORG_C_VIEWER_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000015", "org-c", "VIEWER", true],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000013",
    email: "orgd.analyst@example.test",
    displayName: "Org D Analyst",
    passwordVariable: "DEV_ORG_D_ANALYST_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000016", "org-d", "ANALYST", true],
    ],
  },
  {
    id: "20000000-0000-4000-a000-000000000014",
    email: "orgd.viewer@example.test",
    displayName: "Org D Viewer",
    passwordVariable: "DEV_ORG_D_VIEWER_PASSWORD",
    memberships: [
      ["21000000-0000-4000-a000-000000000017", "org-d", "VIEWER", true],
    ],
  },
];

function passwordFor(account) {
  const password = process.env[account.passwordVariable];
  if (!password || password.length < 16 || password.length > 128) {
    throw new Error(
      `${account.passwordVariable} must contain between 16 and 128 characters.`,
    );
  }
  return password;
}

const client = new Client({ connectionString: migrationDatabaseUrl });
await client.connect();
await client.query(
  "SELECT pg_advisory_lock(hashtext('automotive_search_development_accounts'))",
);

try {
  const preparedAccounts = [];
  for (const account of accounts) {
    preparedAccounts.push({
      ...account,
      passwordHash: await argon2.hash(passwordFor(account), {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
    });
  }

  await client.query("BEGIN");
  try {
    for (const account of preparedAccounts) {
      const existing = await client.query(
        "SELECT id, display_name, status FROM app.app_users WHERE email = $1::citext",
        [account.email],
      );

      if (existing.rowCount === 0) {
        await client.query(
          `
            INSERT INTO app.app_users (id, email, display_name, status)
            VALUES ($1, $2, $3, 'active')
          `,
          [account.id, account.email, account.displayName],
        );
        await client.query(
          `
            INSERT INTO app.user_credentials (user_id, password_hash)
            VALUES ($1, $2)
          `,
          [account.id, account.passwordHash],
        );
      } else {
        const current = existing.rows[0];
        if (
          current.id !== account.id ||
          current.display_name !== account.displayName ||
          current.status !== "active"
        ) {
          throw new Error(`Development account ${account.email} has drifted.`);
        }

        const credential = await client.query(
          "SELECT password_hash FROM app.user_credentials WHERE user_id = $1",
          [account.id],
        );
        if (credential.rowCount !== 1) {
          throw new Error(
            `Development account ${account.email} has no credential.`,
          );
        }
        if (
          !(await argon2.verify(
            credential.rows[0].password_hash,
            passwordFor(account),
          ))
        ) {
          throw new Error(
            `${account.passwordVariable} no longer matches the stored development credential.`,
          );
        }
      }

      for (const [
        membershipId,
        organizationCode,
        roleCode,
        isDefault,
      ] of account.memberships) {
        const insertedMembership = await client.query(
          `
            INSERT INTO app.organization_memberships (
              id, user_id, organization_id, role_id, status, is_default,
              valid_from
            )
            SELECT
              $1, $2, o.id, r.id, 'active', $5, '2026-01-01 00:00:00+00'
            FROM app.organizations o
            CROSS JOIN security.roles r
            WHERE o.code = $3
              AND r.code = $4
              AND r.organization_id IS NULL
            ON CONFLICT (id) DO NOTHING
            RETURNING id
          `,
          [membershipId, account.id, organizationCode, roleCode, isDefault],
        );

        if (insertedMembership.rowCount === 0) {
          const currentMembership = await client.query(
            `
              SELECT o.code AS organization_code, r.code AS role_code,
                     m.status, m.is_default
              FROM app.organization_memberships m
              JOIN app.organizations o ON o.id = m.organization_id
              JOIN security.roles r ON r.id = m.role_id
              WHERE m.id = $1 AND m.user_id = $2
            `,
            [membershipId, account.id],
          );
          const current = currentMembership.rows[0];
          if (
            currentMembership.rowCount !== 1 ||
            current.organization_code !== organizationCode ||
            current.role_code !== roleCode ||
            current.status !== "active" ||
            current.is_default !== isDefault
          ) {
            throw new Error(`Membership ${membershipId} has drifted.`);
          }
        }
      }
    }

    await client.query(`
      INSERT INTO security.user_scope_restrictions (
        id, membership_id, scope_type, effect, company_id, valid_from
      )
      VALUES (
        '31000000-0000-4000-a000-000000000001',
        '21000000-0000-4000-a000-000000000009',
        'company',
        'allow',
        101,
        '2026-01-01 00:00:00+00'
      )
      ON CONFLICT (id) DO NOTHING
    `);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  console.log(`complete  ${accounts.length} development account(s)`);
} finally {
  await client.query(
    "SELECT pg_advisory_unlock(hashtext('automotive_search_development_accounts'))",
  );
  await client.end();
}
