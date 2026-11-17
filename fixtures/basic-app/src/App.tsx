import { useState } from "react";
import { Button } from "@/components";
import type { User } from "./types";
import config from "./config.json";
import styles from "./App.module.css";

export function App() {
  const [user] = useState<User | null>(null);
  return <Button label={user?.name ?? config.title} className={styles.app} />;
}
