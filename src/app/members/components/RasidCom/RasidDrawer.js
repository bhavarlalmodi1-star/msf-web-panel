import React from "react";
import { Drawer } from "antd";
import { PDFViewer } from "@react-pdf/renderer";
import RasidPdfCom from "./RasidPdfCom";

const RasidDrawer = ({ open, setOpen,rasidList }) => {

  const onClose = () => {
    setOpen(false);
  };

  return (
    <Drawer
      title="Rasid Details"
      placement="right"
      size={800}
      onClose={onClose}
      open={open}
    >
      <PDFViewer
        key={open} 
        
        style={{ width: "100%", height: "100vh", border: "none" }}
      >
        <RasidPdfCom rasidList={rasidList} />
      </PDFViewer>
    </Drawer>
  );
};

export default RasidDrawer;