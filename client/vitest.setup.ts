import { installConsoleNoiseFilter } from "./test-support/console-noise";

installConsoleNoiseFilter(console, Boolean(process.env.CI));
