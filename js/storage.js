const PREFIX = "nadar:location:";

function hasArtifactStorage() {
  return typeof window !== "undefined" && typeof window.storage === "object" && window.storage !== null;
}

export async function saveLocation(role, location) {
  const key = PREFIX + role;
  const value = JSON.stringify(location);
  if (hasArtifactStorage()) {
    await window.storage.setItem(key, value);
  } else {
    localStorage.setItem(key, value);
  }
}

export async function loadLocation(role) {
  const key = PREFIX + role;
  const raw = hasArtifactStorage() ? await window.storage.getItem(key) : localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

export async function clearLocation(role) {
  const key = PREFIX + role;
  if (hasArtifactStorage()) {
    await window.storage.removeItem(key);
  } else {
    localStorage.removeItem(key);
  }
}
