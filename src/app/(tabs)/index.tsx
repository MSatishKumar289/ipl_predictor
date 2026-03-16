import { Redirect, type Href } from "expo-router";

const defaultTabRoute = "/(tabs)/home" as Href;

export default function TabsIndex() {
  return <Redirect href={defaultTabRoute} />;
}
