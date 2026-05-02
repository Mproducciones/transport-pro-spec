import { spawn } from "node:child_process";

const envWithRequestedUsers: NodeJS.ProcessEnv = {
  ...process.env,
  SMOKE_ADMIN_EMAIL: "empresa.agente@demo.com",
  SMOKE_ADMIN_PASSWORD: "Admin123!",
  SMOKE_CLIENT_EMAIL: "cliente.agente1@demo.com",
  SMOKE_CLIENT_PASSWORD: "Cliente123!",
  SMOKE_DRIVER_EMAIL: "chofer.agente1@demo.com",
  SMOKE_DRIVER_PASSWORD: "Conductor123!",
};

function run(command: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      stdio: "inherit",
      shell: true,
      env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${code}): ${command}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const steps: Array<{ label: string; command: string; env?: NodeJS.ProcessEnv }> = [
    { label: "Wipe operational demo data", command: "npm run wipe:demo-operational" },
    { label: "Seed requested demo agents", command: "npm run seed:test-agents" },
    { label: "Seed cross-tenant fixtures", command: "npm run seed:clean-accounts" },
    {
      label: "Verify auth roles (requested users)",
      command: "npm run verify:auth-roles",
      env: envWithRequestedUsers,
    },
    {
      label: "Run critical smoke (requested users)",
      command: "npm run smoke:critical",
      env: envWithRequestedUsers,
    },
    {
      label: "Run billing smoke (requested users)",
      command: "npm run smoke:billing",
      env: envWithRequestedUsers,
    },
    { label: "Verify tenant isolation", command: "npm run verify:tenant-isolation" },
    { label: "Run security surface check", command: "npm run security:check" },
  ];

  for (const step of steps) {
    console.log(`\n==> ${step.label}`);
    await run(step.command, step.env ?? process.env);
  }

  console.log("\nQA requested users OK.");
}

main().catch((error) => {
  console.error(`\nQA requested users FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

