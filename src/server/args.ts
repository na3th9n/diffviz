import path from "node:path";
import { parseArgs as parseNodeArgs } from "node:util";

export const DEFAULT_PORT = 4300;

export type CliOptions = {
  root: string;   // absolute path of the project folder
  port: number;   // preferred port; the next free one is used if it is taken
  open: boolean;  // open the browser after starting
  dev: boolean;   // serve the UI through Vite with hot reload
};

export function parseArgs(argv: string[], cwd: string): CliOptions {
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      port: { type: "string" },
      "no-open": { type: "boolean", default: false },
      dev: { type: "boolean", default: false },
      root: { type: "string" },
    },
    strict: true,
  });

  // `npm run dev` always runs from the diffviz folder, so --root lets dev mode
  // point at another project. Users always get the folder they launched from.
  if (values.root !== undefined && !values.dev) {
    throw new Error("--root is only available with --dev");
  }

  return {
    root: values.root === undefined ? cwd : path.resolve(cwd, values.root),
    port: values.port === undefined ? DEFAULT_PORT : parsePort(values.port),
    open: !values["no-open"],
    dev: values.dev,
  };
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid --port: "${value}". Use a whole number from 1 to 65535.`);
  }
  return port;
}
