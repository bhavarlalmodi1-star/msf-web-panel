// utils/uploadUtils.js
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth } from "firebase/auth";

// Upload file to Firebase Storage
export const uploadFile = async (file, path = 'uploads') => {
  // ── Guard: no file selected ──────────────────────────────────────────────
  if (!file) return null;
 
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');
 
    const storage = getStorage();
 
    // Determine final storage path
    // If path looks like a full file path (contains a dot after the last slash), use it directly.
    // Otherwise treat it as a folder and generate a filename.
    const lastSegment = path.split('/').pop();
    let storagePath;
    if (lastSegment.includes('.')) {
      // Caller passed a full path like "memberpayments/JoinFees/agentId/timestamp_name.jpg"
      storagePath = path;
    } else {
      // Caller passed just a folder — auto-generate filename
      const ext      = file.name.split('.').pop() || 'bin';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      storagePath    = `${path}/${Date.now()}_${safeName}`;
    }
 
    const storageRef = ref(storage, storagePath);
 
    // Upload
    const snapshot    = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
 
    return {
      success: true,
      url:     downloadURL,
      path:    storagePath,
      name:    file.name,
      size:    file.size,
      type:    file.type,
    };
  } catch (error) {
    console.error('uploadFile error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

// Validate file before upload
export const validateFile = (file, options = {}) => {
  const {
    maxSize = 5 * 1024 * 1024, // 5MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxWidth,
    maxHeight
  } = options;

  // Check file size
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size must be less than ${maxSize / (1024 * 1024)}MB`
    };
  }

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`
    };
  }

  return { valid: true };
};