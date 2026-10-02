// authSlice.js
import { createSlice } from '@reduxjs/toolkit';
import { set } from 'lodash';

const initialState = {
 selectedProgram: null,
 programList:[],
 agentList:[],
 trustInfo:{},
 msgSendDataMember:{
  memberList:[],
  isSendMsg:false,
 }

};

const commonSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    setselectedProgram: (state, action) => {
      state.selectedProgram = action.payload;
    },
    setProgramList: (state,action) => {
      state.programList =  action.payload;
    },
    setAgentList: (state, action) => {
      state.agentList = action.payload;
  },
  setTrustInfo: (state, action) => {
      state.trustInfo = action.payload; 
},
setMsgSendDataMember: (state, action) => {
      state.msgSendDataMember = action.payload; 
    }
  }
});

export const { setselectedProgram, setProgramList,setAgentList,setTrustInfo,setMsgSendDataMember } = commonSlice.actions;
export default commonSlice.reducer;