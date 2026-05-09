import Constants from 'expo-constants';

const CLOUD_NAME: string = (Constants.expoConfig?.extra?.cloudinaryCloudName as string | undefined) ?? '';
const UPLOAD_PRESET: string = (Constants.expoConfig?.extra?.cloudinaryUploadPreset as string | undefined) ?? 'sallog_comprovantes';

export async function uploadImage(uri: string): Promise<string> {
  const filename = uri.split('/').pop() ?? 'photo.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  const formData = new FormData();
  formData.append('file', { uri, name: filename, type } as any);
  formData.append('upload_preset', UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Falha no upload da imagem');
  const data = await res.json();
  return data.secure_url as string;
}
