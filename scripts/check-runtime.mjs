const requiredNode = "v22.23.1";
if (process.version !== requiredNode) {
  console.error(
    `Space Zero requires Node ${requiredNode}; got ${process.version}`,
  );
  process.exit(1);
}
const ua = process.env.npm_config_user_agent ?? "";
if (ua && !ua.startsWith("pnpm/10.28.1 ")) {
  console.error(`Space Zero requires pnpm 10.28.1; got ${ua}`);
  process.exit(1);
}
