import { useEffect, useState, type ReactElement } from "react";

export const App = (): ReactElement => {
  const [version, setVersion] = useState("loading");
  useEffect(() => {
    let mounted = true;
    window.spacezero.getAppVersion().then((value) => {
      if (mounted) setVersion(value);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <main className="shell" aria-labelledby="app-title">
      <p className="eyebrow">Initialization slice</p>
      <h1 id="app-title">Space Zero</h1>
      <dl>
        <div>
          <dt>Desktop version</dt>
          <dd>{version}</dd>
        </div>
      </dl>
    </main>
  );
};
