"use client";

import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { store, persistor } from "./store";

// PersistGate's function-child form renders straight away instead of waiting for the saved
// state. The default form rendered nothing on the server, so every page reached search
// engines (and first paint) empty. Login-dependent UI waits through useAuth() instead.
export function Providers({ children }) {
  return (
    <Provider store={store}>
      <PersistGate persistor={persistor}>{() => children}</PersistGate>
    </Provider>
  );
}
