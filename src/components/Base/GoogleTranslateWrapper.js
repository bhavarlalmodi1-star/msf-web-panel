"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";

const GoogleTranslate = dynamic(() => import("./GoogleTranslate"), {
  ssr: false,
  loading: () => null,
});

const GoogleTranslateWrapper = () => {
  useEffect(() => {
    const removeBanner = () => {
      const banner = document.querySelector(".goog-te-banner-frame");
      if (banner) {
        banner.style.display = "none";
      }
      document.body.style.top = "0px";
    };

    removeBanner();

    const observer = new MutationObserver(removeBanner);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return <GoogleTranslate />;
};

export default GoogleTranslateWrapper;
