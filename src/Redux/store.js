import { configureStore } from '@reduxjs/toolkit';
import commonReducer from "../Redux/Slice/commonSlice"
import userReducer from "../Redux/Slice/userSlice"
export const store = configureStore({
    reducer: {
      data: commonReducer,
      user: userReducer,
    },
  });
  
  export default store;