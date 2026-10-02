import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  user: null,
  loading: true,
  permissions: null,
  role: null,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action) => {
      const u = action.payload;
      state.user = u;
      state.role = u?.role || null;
      state.permissions = u?.permissions || null;
      state.loading = false;
    },
    clearUser: (state) => {
      state.user = null;
      state.role = null;
      state.permissions = null;
      state.loading = true;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
  },
});

export const { setUser, clearUser, setLoading } = userSlice.actions;
export default userSlice.reducer;
