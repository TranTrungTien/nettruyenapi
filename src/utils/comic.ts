import axios, { AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import { Cheerio, CheerioAPI, load } from "cheerio";
import { CookieJar } from "tough-cookie";
import { wrapper as axiosCookieJarSupport } from "axios-cookiejar-support";
import randomUserAgent from "random-useragent";
import { randomDelay } from ".";

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

class StoryApi {
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
        await randomDelay();
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
    private _convertText(element: Cheerio<any>): string {
        if (!element || !element.html()) return '';
        const html = element.html()!
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li)>/gi, '\n')
            .replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{2,}/g, '\n\n');
        return html.trim();
    }
    // --- PARSERS ---

    private _parseStoryItem($: CheerioAPI, item: any) {
        const $item = $(item);
        const titleLink = this._get($item, SELECTORS.comicList.titleLink);
        const href = titleLink.attr("href") || "";
        const thumbDiv = this._get($item, SELECTORS.comicList.thumbnail);
        const chapterLink = this._get($item, SELECTORS.comicList.lastChapterLink);
        const chapterHref = chapterLink.attr("href") || "";
        const chapterMatch = chapterHref.match(/chuong-(\d+)/) || chapterHref.match(/-(\d+)\/?$/);
        const thumbnailSrc = thumbDiv.attr("data-image") || thumbDiv.attr("data-desk-image") || thumbDiv.find("img").attr("src") || "";

        return {
            title: this._getDefaultText(titleLink.attr("title") || titleLink.text()),
            id: this._getId(href),
            href,
            thumbnail: thumbnailSrc,
            fullThumbnail: thumbnailSrc, // V2 không có fullThumbnail riêng, dùng chung thumbnail
            authors: [this._trim($item.find(SELECTORS.comicList.author).clone().find(".glyphicon").remove().end().text())],
            otherNames: [], // V2 không có trong list view
            genres: [], // V2 không có genres trong list view
            shortDescription: this._getDefaultText(),
            status: "Full", // V2 không có status trong list view, default Full
            totalChapters: 0, // V2 không có trong list view
            totalViews: 0, // V2 không có trong list view
            followers: 0, // V2 không có
            totalComments: 0, // V2 không có
            isTrending: $item.find(SELECTORS.comicList.trendingIcon).length > 0,
            isHot: $item.find(SELECTORS.comicList.trendingIcon).length > 0, // Dùng chung với isTrending
            isCompleted: false, // V2 không có trong list view
            latestChapter: {
                id: chapterHref.split('/').pop() || '',
                name: this._trim(chapterLink.text()),
                url: chapterHref ? `${this.domain}${chapterHref}` : '',
                chapterNumber: chapterMatch ? Number(chapterMatch[1]) : 0,
                updatedAt: new Date().toISOString(), // V2 không có updatedAt
            },
        };
    }

    // --- PUBLIC API METHODS ---

    private async getStories(path: string, page: number = 1): Promise<any> {
        const fullPath = `${path}${page > 1 ? `trang-${page}/` : ''}`;
        const $ = await this.createRequest(fullPath);

        const pagHref = this._get($(SELECTORS.comicList.pagination[0]).parent(), SELECTORS.comicList.pagination.join(', ')).attr('href');
        const totalPages = Number(pagHref?.match(/trang-(\d+)/)?.[1] || pagHref?.match(/page[=\/](\d+)/)?.[1] || 1);

        if (page > totalPages) {
            return { status: 404, message: "Page not found" };
        }

        const comics = $(SELECTORS.comicList.item).map((_, el) => this._parseStoryItem($, el)).get();

        return {
            comics,
            currentPage: page,
            totalPages: totalPages,
            hasMorePages: page < totalPages
        };
    }

    public async getChapters(params: { slug: string, chapterPage?: number }): Promise<any> {
        const { slug, chapterPage = 1 } = params;
        const $ = await this.createRequest(`${slug}/trang-${chapterPage}/`);
        return $(SELECTORS.chapterList.item).map((_, chap) => {
            const href = $(chap).attr("href") || '';
            const title = this._getDefaultText($(chap).attr("title") || $(chap).text());
            const chapterMatch = href.match(/chuong-(\d+)/i) || title.match(/Chương\s*(\d+)/i);

            return {
                id: href.split('-').pop()?.replace('/', '') || '0',
                name: title,
                chapterNumber: chapterMatch ? parseInt(chapterMatch[1], 10) : 0,
                url: `${this.domain}${href}`,
                updatedAt: new Date().toISOString(),
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
                url: href
            };
        }).get();
    }

    public async getRecommendStory(): Promise<any> {
        return this.getStories("danh-sach/truyen-hot/trang-1");
    }

    public async getRecentUpdateStory(): Promise<any> {
        return this.getRecentUpdateStoryInfo();
    }

    public async getCompletedStory(page: number = 1): Promise<any> {
        return this.getStories("danh-sach/truyen-full/", page);
    }

    public async getStoryByGenre(genreId: string, page: number = 1): Promise<any> {
        const path = genreId === "all" ? "danh-sach/truyen-moi/" : `the-loai/${genreId}/`;
        return this.getStories(path, page);
    }

    public async getTrendingStory(page: number = 1): Promise<any> {
        return this.getStories("danh-sach/truyen-hot/", page);
    }

    public async searchStory(query: string, page: number = 1): Promise<any> {
        const path = `tim-kiem/?tukhoa=${query.replace(/\s+/g, "+")}&`;
        return this.getStories(path, page);
    }

    public async getStoryDetail(params: { slug: string }): Promise<any> {
        const $ = await this.createRequest(`${params.slug}/`);

        const listChapter = $(SELECTORS.comicDetail.chapterListPagination);
        const secondLastPage = listChapter.eq(-2).find('a').attr("href");
        const lastPage = listChapter.eq(-1).find('a').attr("href");
        const pagHref = lastPage?.includes('javascript:void(0)') ? secondLastPage : lastPage;
        const totalChapterPages = Number(pagHref?.match(/trang-(\d+)/)?.[1] || 1);

        // Fetch first and last page of chapters concurrently
        const [chapters_page_1, chapters_page_last] = await Promise.all([
            this.getChapters({ ...params, chapterPage: 1 }),
            totalChapterPages > 1 ? this.getChapters({ ...params, chapterPage: totalChapterPages }) : Promise.resolve([]),
        ]);

        const totalChapters = (chapters_page_1.length * (totalChapterPages - 1)) + chapters_page_last.length;
        const thumbnailSrc = $(SELECTORS.comicDetail.thumbnail).attr("src") || "";

        return {
            title: this._convertText($(SELECTORS.comicDetail.title)),
            thumbnail: thumbnailSrc,
            description: this._convertText($(SELECTORS.comicDetail.description)),
            authors: $(SELECTORS.comicDetail.authors).map((_, el) => this._getDefaultText($(el).text())).get(),
            status: this._getDefaultText($(SELECTORS.comicDetail.status)?.text()),
            genres: $(SELECTORS.comicDetail.genres).map((_, item) => ({
                id: this._getId($(item).attr("href") || ''),
                name: $(item).text(),
            })).get(),
            totalViews: this._formatTotal(this._trim($(SELECTORS.comicDetail.totalViews).text())).toString(),
            average: this._getDefaultText((Number($(SELECTORS.comicDetail.averageRating).text()) || 0).toString()),
            ratingCount: this._getDefaultText((Number($(SELECTORS.comicDetail.ratingCount).attr("data-score")) || 0).toString()),
            totalChapters: totalChapters,
            totalChapterPages: totalChapterPages,
            chapters: chapters_page_1, // Only return first page of chapters
            id: params.slug,
            followers: this._getDefaultText(), // V2 không có
            isAdult: false, // V2 không có
            otherNames: [], // V2 không có
            translators: [], // V2 không có
        };
    }

    public async getChapterContent(params: { slug: string, id: string }): Promise<any> {
        const [$, chapters_page_1] = await Promise.all([
            this.createRequest(`${params.slug}/chuong-${params.id}/`),
            this.getChapters({ slug: params.slug, chapterPage: 1 }), // Get first page for chapter list
        ]);

        const chapterMatch = params.id.match(/(\d+)/);

        return {
            comicName: this._getDefaultText($(SELECTORS.chapterContent.comicName).text()),
            chapterName: this._getDefaultText($(SELECTORS.chapterContent.chapterName).text()),
            content: this._getDefaultText(this._convertText($(SELECTORS.chapterContent.content))),
            chapterNumber: chapterMatch ? Number(chapterMatch[1]) : 0,
            chapters: [], // V3 trả về empty array
        };
    }

    public async getRecentUpdateStoryInfo(): Promise<any> {
        try {
            const $ = await this.createRequest("") as CheerioAPI;
            const comics = $('#list-index .list-truyen .row').map((_, element) => {
                const $item = $(element);
                const titleLink = $item.find('h3[itemprop="name"] a');
                const href = titleLink.attr('href')?.replace(/^\//, '') || '';
                
                const chapterLink = $item.find(".col-chap.text-info a");

                return {
                    id: href.split('/').filter(Boolean)[2] || href,
                    title: titleLink.text().trim().replace(/^\s*›\s*/, '').trim(),
                    href: href,
                    genres: $item.find(".col-cat a[itemprop='genre']").map((_, el) => ({
                        id: $(el).attr('href')?.replace('/the-loai/', '') || '',
                        name: $(el).text().trim(),
                    })).get(),
                    status: 'Đang cập nhật',
                    totalChapters: 0,
                    latestChapter: {
                        name: chapterLink.text().trim(),
                        href: chapterLink.attr('href') || '',
                        id: chapterLink.attr('href')?.split('/').filter(Boolean)[3] || '',
                    },
                    updatedAt: $item.find(".col-time").text().trim(),
                    // --- Default fields to match response structure ---
                    thumbnail: '', fullThumbnail: '', authors: [], otherNames: [], shortDescription: '',
                    totalViews: 0, followers: 0, totalComments: 0, isTrending: false, isHot: false,
                    isCompleted: false,
                };
            }).get();
            return {
                comics,
                currentPage: 1,
                totalPages: 1,
                hasMorePages: false,
            };
        } catch (error) {
            return { comics: [], currentPage: 1, totalPages: 1, hasMorePages: false };
        }
    }

    public async getStoryByAuthor(alias: string) {
        return this.getStories(`tac-gia/${alias}/`);
    }
}

export const Story = new StoryApi();