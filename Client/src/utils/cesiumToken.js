// Reads the Cesium ion token from the environment and repairs the usual
// copy/paste mistakes (a pasted "VITE_CESIUM_ION_TOKEN=" inside the value,
// quotes, stray spaces). Never logs the token itself.

const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;

export function readCesiumToken() {
  const raw = import.meta.env.VITE_CESIUM_ION_TOKEN ?? "";
  const token = raw
    .replace(/VITE_CESIUM_ION_TOKEN\s*=/g, "")
    .replace(/^[\s"']+|[\s"']+$/g, "");

  let problem = null;
  if (!token) {
    problem = "missing";
  } else if (!JWT_SHAPE.test(token)) {
    problem = "malformed";
  }
  return { token, problem, repaired: token !== raw && token.length > 0 };
}
