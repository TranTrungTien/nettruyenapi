
import axios, { AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import { Cheerio, CheerioAPI, load } from "cheerio";
import { CookieJar } from "tough-cookie";
import { wrapper as axiosCookieJarSupport } from "axios-cookiejar-support";
import randomUserAgent from "random-useragent";

// --- CONSTANTS AND SELECTORS ---

const MOBILE_UA_FALLBACKS = [
    "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
];

const SELECTORS = {
    // Comic List
    comicList: {
        item: ".col-truyen-main .list-truyen .row",
        titleLink: [".truyen-title a", ".col-xs-7 a"], // Array of possible selectors
        thumbnail: ".lazyimg",
        author: ".author",
        lastChapterLink: [".text-info a", ".col-xs-2 a"],
        trendingIcon: ".label-title.label-hot",
        pagination: [".col-truyen-main .pagination li:eq(-2) a", ".paging a:last-child", "ul.pagination li:last-child a"],
    },
    // Comic Detail
    comicDetail: {
        title: ".col-truyen-main .col-info-desc .title",
        thumbnail: ".col-truyen-main .books img",
        description: ".col-truyen-main .desc-text",
        authors: ".col-truyen-main .info div:contains('Tác giả') a",
        status: ".col-truyen-main .text-success",
        genres: ".col-truyen-main .info div:contains('Thể loại') a",
        totalViews: ".col-truyen-main .info div:contains('Lượt xem') span",
        ratingCount: ".col-truyen-main .rate-holder",
        averageRating: ".col-truyen-main .small span:last-child",
        chapterListPagination: "#list-chapter .pagination li",
    },
    // Chapter List
    chapterList: {
        item: "#list-chapter .list-chapter li a",
    },
    // Chapter Content
    chapterContent: {
        chapterName: "#chapter-big-container .chapter-title",
        comicName: "#chapter-big-container .truyen-title",
        content: '#chapter-c',
    },
    // Genres Page
    genreList: ".navbar-nav li.dropdown:contains('Danh sách') .dropdown-menu a",
};

// --- UTILITY FUNCTIONS ---

function getMobileUA(): string {
    const ua = randomUserAgent.getRandom((u: any) => !!u && /Mobile|Android|iPhone/i.test(u));
    return ua || MOBILE_UA_FALLBACKS[Math.floor(Math.random() * MOBILE_UA_FALLBACKS.length)];
}

class ComicsApi {
    private domain?: string;
    private axiosInstance: AxiosInstance;

    constructor() {
        this.domain = process.env.BASE_URL_V2;
        this.axiosInstance = this._initAxios();
    }

    private _initAxios(): AxiosInstance {
        const jar = new CookieJar();
        const inst = axios.create({
            timeout: 15000,
            headers: {
                "User-Agent": getMobileUA(),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
                "Connection": "keep-alive",
            },
        });

        axiosCookieJarSupport(inst);
        (inst.defaults as any).jar = jar;

        axiosRetry(inst, {
            retries: 3,
            retryDelay: (count) => count * 1000,
            retryCondition: (error) =>
                axiosRetry.isNetworkOrIdempotentRequestError(error) ||
                [429, 502, 503, 504].includes(error.response?.status as number),
        });

        return inst;
    }
    
    private async createRequest(path: string): Promise<CheerioAPI> {
        const url = `${this.domain}/${path}`.replace(/\?+/g, "?");
        console.log("Fetching:", url);
        // await this.randomDelay();
        try {
            const resp = await this.axiosInstance.get(url, { headers: { "Referer": this.domain } });
            return load(resp.data);
        } catch (err: any) {
            console.error(`❌ Request failed for ${url}:`, err.message);
            throw err;
        }
    }

    // --- CORE HELPERS ---

    private _get(element: Cheerio<any>, selector: string | string[]) {
        if (Array.isArray(selector)) {
            for (const s of selector) {
                const result = element.find(s);
                if (result.length) return result.first();
            }
            return element.find('selector-that-does-not-exist');
        } 
        return element.find(selector).first();
    }

    private _getId = (link?: string, position: number = -2): string => link?.split("/").at(position) || "";
    private _formatTotal = (total?: string): number => total ? Number(total.replace(/[.,]/g, "")) : 0;
    private _trim = (text?: string): string => text?.replace(/\n/g, " ").replace(/\s+/g, " ").trim() || "";
    private _getDefaultText = (value?: string): string => this._trim(value) || 'Đang cập nhật';
    private _convertText = (element: Cheerio<any>): string => this._trim(element.text());

    // --- PARSERS ---

    private _parseComicItem($: CheerioAPI, item: any) {
        const $item = $(item);
        const titleLink = this._get($item, SELECTORS.comicList.titleLink);
        const href = titleLink.attr("href") || "";
        const thumbDiv = this._get($item, SELECTORS.comicList.thumbnail);
        const chapterLink = this._get($item, SELECTORS.comicList.lastChapterLink);
        const chapterHref = chapterLink.attr("href") || "";
        const chapterMatch = chapterHref.match(/chuong-(\d+)/) || chapterHref.match(/-(\d+)\/?$/);

        return {
            title: this._getDefaultText(titleLink.attr("title") || titleLink.text()),
            id: this._getId(href),
            href,
            thumbnail: thumbDiv.attr("data-image") || thumbDiv.attr("data-desk-image") || thumbDiv.find("img").attr("src") || "",
            authors: [this._trim($item.find(SELECTORS.comicList.author).clone().find(".glyphicon").remove().end().text())],
            lastest_chapters: [{
                id: chapterMatch ? Number(chapterMatch[1]) : 0,
                name: this._trim(chapterLink.text()),
                updated_at: this._getDefaultText(),
            }],
            is_trending: $item.find(SELECTORS.comicList.trendingIcon).length > 0,
            // Default values for fields not present in list view
            short_description: this._getDefaultText(),
            genres: [],
            other_names: [],
            status: "Full",
            total_views: this._getDefaultText(),
            total_comments: this._getDefaultText(),
            followers: this._getDefaultText(),
            updated_at: this._getDefaultText(),
        };
    }

    // --- PUBLIC API METHODS ---

    private async getComics(path: string, page: number = 1): Promise<any> {
        const fullPath = `${path}${page > 1 ? `trang-${page}/` : ''}`;
        const $ = await this.createRequest(fullPath);

        const pagHref = this._get($(SELECTORS.comicList.pagination[0]).parent(), SELECTORS.comicList.pagination.join(', ')).attr('href');
        const total_pages = Number(pagHref?.match(/trang-(\d+)/)?.[1] || pagHref?.match(/page[=\/](\d+)/)?.[1] || 1);

        if (page > total_pages) {
            return { status: 404, message: "Page not found" };
        }

        const comics = $(SELECTORS.comicList.item).map((_, el) => this._parseComicItem($, el)).get();
        return { comics, total_pages, current_page: page };
    }

    public async getChapters(params: { slug: string, chapterPage?: number }): Promise<any> {
        const { slug, chapterPage = 1 } = params;
        const $ = await this.createRequest(`${slug}/trang-${chapterPage}/`);
        return $(SELECTORS.chapterList.item).map((_, chap) => {
            const href = $(chap).attr("href") || '';
            return {
                id: href.split('-').pop()?.replace('/', '') || '0',
                name: this._getDefaultText($(chap).attr("title") || $(chap).text()),
            };
        }).get();
    }

    public async getGenres(): Promise<any> {
        const $ = await this.createRequest("");
        return $(SELECTORS.genreList).map((_, item) => {
            const href = $(item).attr("href") || "";
            return {
                id: this._getId(href),
                name: this._trim($(item).text()),
                description: $(item).attr("title") || "",
            };
        }).get();
    }

    public async getRecommendComics(): Promise<any> {
        return this.getComics("danh-sach/truyen-hot/trang-1");
    }

    public async getRecentUpdateComics(page: number = 1): Promise<any> {
        return this.getComics("danh-sach/truyen-moi/", page);
    }

    public async getCompletedComics(page: number = 1): Promise<any> {
        return this.getComics("danh-sach/truyen-full/", page);
    }

    public async getComicsByGenre(genreId: string, page: number = 1): Promise<any> {
        const path = genreId === "all" ? "danh-sach/truyen-moi/" : `the-loai/${genreId}/`;
        return this.getComics(path, page);
    }

    public async getTrendingComics(page: number = 1): Promise<any> {
        return this.getComics("danh-sach/truyen-hot/", page);
    }

    public async searchComics(query: string, page: number = 1): Promise<any> {
        const path = `tim-kiem/?tukhoa=${query.replace(/\s+/g, "+")}&`;
        return this.getComics(path, page);
    }

    public async getComicDetail(params: { slug: string }): Promise<any> {
        const $ = await this.createRequest(`${params.slug}/`);

        const listChapter = $(SELECTORS.comicDetail.chapterListPagination);
        const secondLastPage = listChapter.eq(-2).find('a').attr("href");
        const lastPage = listChapter.eq(-1).find('a').attr("href");
        const pagHref = lastPage?.includes('javascript:void(0)') ? secondLastPage : lastPage;
        const total_chapter_pages = Number(pagHref?.match(/trang-(\d+)/)?.[1] || 1);

        // Fetch first and last page of chapters concurrently
        const [chapters_page_1, chapters_page_last] = await Promise.all([
            this.getChapters({ ...params, chapterPage: 1 }),
            total_chapter_pages > 1 ? this.getChapters({ ...params, chapterPage: total_chapter_pages }) : Promise.resolve([]),
        ]);

        const total_chapters_of_comic = (chapters_page_1.length * (total_chapter_pages - 1)) + chapters_page_last.length;

        return {
            title: this._convertText($(SELECTORS.comicDetail.title)),
            thumbnail: $(SELECTORS.comicDetail.thumbnail).attr("src") || "",
            description: this._convertText($(SELECTORS.comicDetail.description)),
            authors: $(SELECTORS.comicDetail.authors).map((_, el) => this._getDefaultText($(el).text())).get(),
            status: this._getDefaultText($(SELECTORS.comicDetail.status)?.text()),
            genres: $(SELECTORS.comicDetail.genres).map((_, item) => ({
                id: this._getId($(item).attr("href") || ''),
                name: $(item).text(),
            })).get(),
            total_views: this._formatTotal(this._trim($(SELECTORS.comicDetail.totalViews).text())),
            average: Number($(SELECTORS.comicDetail.averageRating).text()) || 0,
            rating_count: Number($(SELECTORS.comicDetail.ratingCount).attr("data-score")) || 0,
            followers: this._getDefaultText(), // Not available
            chapters: chapters_page_1, // Only return first page of chapters
            id: params.slug,
            is_adult: false, // Not available
            other_names: [], // Not available
            total_chapter_pages,
            total_chapters_of_comic,
        };
    }

    public async getChapterContent(params: { slug: string, id: string }): Promise<any> {
        const [$, chapters_page_1] = await Promise.all([
            this.createRequest(`${params.slug}/chuong-${params.id}/`),
            this.getChapters({ slug: params.slug, chapterPage: 1 }), // Get first page for chapter list
        ]);

        return {
            chapter_name: this._getDefaultText($(SELECTORS.chapterContent.chapterName).text()),
            comic_name: this._getDefaultText($(SELECTORS.chapterContent.comicName).text()),
            content: this._getDefaultText(this._convertText($(SELECTORS.chapterContent.content))),
            chapters: chapters_page_1,
        };
    }

    public async getComicsByAuthor(alias: string) {
        return this.getComics(`tac-gia/${alias}/`);
    }
}

export const Comics = new ComicsApi();
