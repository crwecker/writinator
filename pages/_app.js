import "../src/styles/globals.css";
import { AppWrapper } from "../src/state";

function Application({ Component, pageProps }) {
  return (
    <AppWrapper>
      <Component {...pageProps} />
    </AppWrapper>
  );
}

export default Application;
