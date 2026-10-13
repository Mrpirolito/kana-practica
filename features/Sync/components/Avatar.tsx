'use client';

interface AvatarProps {
  url: string | null;
  name: string;
  size: number;
}

// Profile picture, or the first letter of the name when there is none
export default function Avatar({ url, name, size }: AvatarProps) {
  const style = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- user uploads on Supabase Storage
    return <img src={url} alt={name} style={style} className='rounded-full object-cover' />;
  }
  return (
    <span
      style={{ ...style, fontSize: size * 0.45 }}
      className='flex items-center justify-center rounded-full bg-(--main-color) font-bold text-white uppercase'
    >
      {name[0]}
    </span>
  );
}
