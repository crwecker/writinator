import "./styles/globals.css";
import { AppWrapper } from "./state";

function Application({ Component, pageProps }) {
  return (
    <AppWrapper>
      <Component {...pageProps} />
    </AppWrapper>
  );
}

export default Application;
