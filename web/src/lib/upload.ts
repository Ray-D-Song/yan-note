export async function uploadImageFile(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/v1/uploads', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  if (!response.ok) {
    throw new Error('图片上传失败')
  }

  const data = (await response.json()) as { url: string }
  return data.url
}
