// Map với model Flutter
export interface Chapter {
    id: string;
    name: string;
}

export interface Genre {
    id: string;
    name: string;
    description?: string;
}

export interface Comic {
    id: string;
    title: string;
    thumbnail?: string;
    description?: string;
    authors?: string;
    status?: string;
    other_names?: string[];
    total_views?: string;
    followers?: string;
    is_trending?: boolean;
    last_chapter?: Chapter | null;
    short_description?: string;
    updated_at?: string;
    chapters?: Chapter[];
    genres?: Genre[];
}

export interface ComicList {
    comics: Comic[];
    current_page: number;
    total_pages: number;
}

export interface ContentChapter {
    chapter_name: string;
    comic_name: string;
    chapters: Chapter[];
    images: any[]; // Truyện chữ nên để []
    content: string; // Nội dung chữ của chương
}

// Định nghĩa cho API response từ daotruyen.me
export interface DaoStory {
    id: number;
    url: string;
    name: string;
    image?: string;
    description?: string;
    authorName?: string;
    state?: number;
    totalView: number;
    updatedAt?: string;
}

export interface DaoChapter {
    id: number;
    chapterNumber: number;
    title: string;
    updatedAt?: string;
    paragraph?: string;
}

export interface DaoCategory {
    id: number;
    categoryName: string;
    url: string;
}

export interface DaoTeam {
    id: number;
    teamName: string;
}