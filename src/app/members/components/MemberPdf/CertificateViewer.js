import { PDFViewer } from "@react-pdf/renderer";
import { useSelector } from "react-redux";
import CertificateCom from "./CertificateCom";


const CertificateViewer = ({memberData={}}) => {
   const programList = useSelector((state) => state.data.programList)
   const memberProgram=programList.find((x)=>x.id===memberData.programId)
  return (
    <PDFViewer style={{ width: '100%', height: '100vh', border: 'none' }}>
      <CertificateCom data={memberData} memberProgram={memberProgram} />
    </PDFViewer>
  );
};

export default CertificateViewer;