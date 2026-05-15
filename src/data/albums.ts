import albumsData from "./albums.json";

export interface Photo {
    src: string;
    variant: '1x1' | '4x3' | '4x5' | '9x16';
    title?: string;
    description?: string;
}

export interface AlbumItem {
    date: string;
    event: string;
    title: string;
    description?: string;
    icon?: string;
    photos?: Photo[];
}

export const albums: AlbumItem[] = albumsData as AlbumItem[];

export const formattedDate = (date: string, formatOpts?: Intl.DateTimeFormatOptions) => {
    return new Date(date).toLocaleDateString('zh-CN', formatOpts || {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};
