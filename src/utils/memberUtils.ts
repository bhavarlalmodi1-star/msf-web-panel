import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp,
  getDoc,
  doc 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import dayjs from 'dayjs';
import { db, storage } from '../../lib/firbase-client';

// File upload utility
export const uploadFile = async (file: any, folder: string, fileName: string) => {
  if (!file) return '';
  
  try {
    // For React Native, you might need to handle file URI differently
    const response = await fetch(file.uri);
    const blob = await response.blob();
    
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storageRef = ref(storage, `${folder}/${timestamp}_${sanitizedFileName}`);
    const snapshot = await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

// Generate registration number
export const generateRegistrationNumber = async () => {
  try {
    const year = dayjs().format('YYYY');
    const month = dayjs().format('MM');
    const prefix = 'MEM';
    
    // Count members for current month
    const startDate = `01-${month}-${year}`;
    const endDate = `31-${month}-${year}`;
    
    const q = query(
      collection(db, 'members'),
      where('dateJoin', '>=', startDate),
      where('dateJoin', '<=', endDate)
    );
    
    const snapshot = await getDocs(q);
    const count = snapshot.size + 1;
    
    return `${prefix}${year}${month}${count.toString().padStart(4, '0')}`;
  } catch (error) {
    console.error('Error generating registration number:', error);
    return `MEM${dayjs().format('YYYYMMDDHHmmss')}`;
  }
};

// Create search index
export function createSearchIndex(data: any) {
  const indexSet = new Set();

  const addPrefixes = (text: string) => {
    const str = String(text).toLowerCase().trim();
    if (!str) return;

    indexSet.add(str);
    
    str.split(/\s+/).forEach(word => {
      if (word.length > 1) {
        indexSet.add(word);
        
        let prefix = "";
        for (const ch of word) {
          prefix += ch;
          if (prefix.length > 1) {
            indexSet.add(prefix);
          }
        }
      }
    });
  };

  const traverse = (value: any) => {
    if (value === null || value === undefined) return;

    if (typeof value === "object") {
      if (Array.isArray(value)) {
        value.forEach(v => traverse(v));
      } else {
        Object.values(value).forEach(v => traverse(v));
      }
    } else {
      addPrefixes(value);
    }
  };

  traverse(data);

  return Array.from(indexSet).filter(item => item.length > 0);
}

// Check Aadhaar duplicate
export const checkAadhaarDuplicate = async (aadhaarNumber: any) => {
  try {
    if (!aadhaarNumber || aadhaarNumber.length !== 12) {
      return null;
    }

    const q = query(
      collection(db, 'members'),
      where('aadhaarNo', '==', aadhaarNumber),
      where('delete_flag', '!=', true)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    const memberDoc = snapshot.docs[0];
    const memberData = memberDoc.data();
    
    const programsRef = collection(db, 'members', memberDoc.id, 'memberPrograms');
    const programsSnap = await getDocs(programsRef);
    const programs = programsSnap.docs.map(doc => doc.data());
    
    return {
      memberId: memberDoc.id,
      ...memberData,
      programs: programs
    };
    
  } catch (error) {
    console.error('Error checking Aadhaar duplicate:', error);
    throw error;
  }
};

// Create member account
export const createMemberAccount = async (memberData: any, db: any, currentUser: any) => {
  try {
    // Create account creation request
    const accountRequest = {
      memberData,
      status: 'creating',
      requestedBy: currentUser?.uid,
      requestedAt: serverTimestamp(),
      operation: 'create_account',
    };

    await addDoc(collection(db, 'accountRequests'), accountRequest);

    // You can add your API call here for account creation
    // await fetch('/api/create-account', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${await currentUser.getIdToken()}`
    //   },
    //   body: JSON.stringify({
    //     memberData,
    //     operation: 'add'
    //   })
    // });

    return { success: true, message: 'Account creation request submitted' };
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
};

// Handle submit (main function)
export const handleSubmit = async (
  values: any,
  context: any,
  message: any
) => {
  // Implementation similar to your original handleSubmit
  // This is the main function that orchestrates everything
  return true;
};