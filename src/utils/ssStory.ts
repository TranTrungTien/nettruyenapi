
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
    // Story List
    storyList: {
        item: ".container .main-wrapper .truyen-list .item",
        titleLink: "h3 a",
        thumbnail: ".cover img",
        authors: "p.line:contains('Tác giả') a",
        genres: "p.line:contains('Thể loại') a",
        statusIcon: "h3 i.status",
        statusFullClass: "status-full",
        totalChapters: "p.line:contains('Số chương')",
        paginationLinks: ".phan-trang a.btn-page",
        paginationNext: ".phan-trang a:contains('❭')",
    },
    // Recent Updates
    recentUpdate: {
        item: '.main-wrapper .itemupdate',
        titleLink: '.iname h3 a',
        genres: '.icate a',
        chapterLink: '.ichapter a',
        updatedAt: '.iupdated',
        statusFull: '.status .status-full',
        statusNew: '.status .status-new',
    },
    // Story Detail
    storyDetail: {
        title: "h1[itemprop='name']",
        altTitle: ".title",
        thumbnail: ".book-info-pic img",
        ogImage: 'meta[property="og:image"]',
        booksImage: ".books img",
        description: "#gioithieu div[itemprop='description']",
        authors: ".book-info-text li:contains('Tác giả') a",
        status: ".label-status",
        genres: ".book-info-text li.li--genres a",
        totalViews: ".book-info-text li:contains('Lượt xem')",
        totalChapters: ".book-info-text li:contains('Số chương')",
        ratingCount: ".rate-holder",
        averageRating: ".book-rating .rate_row_result",
    },
    // Chapter List (AJAX)
    chapterList: {
        item: 'ul li a',
    },
    // Chapter Content
    chapterContent: {
        pageTitle: 'title',
        chapterName: "#chapter-big-container .chapter-title",
        comicName: "#chapter-big-container .truyen-title",
        recentlyViewedScript: 'script#recently_viewed',
        content: "#vungdoc .truyen",
    },
    // Genres Page
    genreList: ".menu-section a.dropdown:contains('THỂ LOẠI')",
    genreListItem: '.menu-subs.menu-mega a',
    // Script Variables for Book ID
    scripts: 'script',
    pagingLinks: '.paging a',
    bookIdInput: 'input[name="bid"]',
    // Paging
    lastPageLink: ".paging a:contains('Cuối'), .paging a:contains('»')",
};


// --- UTILITY FUNCTIONS ---

function getMobileUA(): string {
    const ua = randomUserAgent.getRandom(
        (u: any) => !!u && /Mobile|Android|iPhone/i.test(u)
    );
    return ua || MOBILE_UA_FALLBACKS[Math.floor(Math.random() * MOBILE_UA_FALLBACKS.length)];
}

class SSStoryApi {
    private domain?: string;
    private axiosInstance: AxiosInstance;

    constructor() {
        this.domain = process.env.BASE_URL_V3;
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

    // --- CORE HELPERS ---
    private async createRequest(path?: string, shouldReturnRawData = false): Promise<any> {
        const url = `${this.domain}/${path}`.replace(/\?+/g, "?");
        console.log("Fetching:", url);
        await randomDelay();
        try {
            const resp = await this.axiosInstance.get(url, {
                withCredentials: true,
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "User-Agent": getMobileUA(),
                    "Referer": this.domain,
                },
            });
            return shouldReturnRawData ? resp.data : load(resp.data);
        } catch (err: any) {
            console.error(`❌ Request failed for ${url}:`, err.message);
            throw err;
        }
    }

    private _getDefaultText = (value?: string): string => value || 'Đang cập nhật';

    private _convertHrefToId = (value: string, position: number = 1): string => value?.split('/')?.[position] ?? '';

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

    private _parseStoryItemFromList($: CheerioAPI, item: any) {
        const $item = $(item);
        const titleA = $item.find(SELECTORS.storyList.titleLink).first();
        const href = titleA.attr("href") || "";
        const thumbnailSrc = $item.find(SELECTORS.storyList.thumbnail).attr("src") || "";

        return {
            title: this._getDefaultText(titleA.text()),
            id: this._convertHrefToId(href, 1),
            href,
            thumbnail: thumbnailSrc.startsWith("http") ? thumbnailSrc : `${this.domain}${thumbnailSrc}`,
            authors: $item.find(SELECTORS.storyList.authors).map((_, el) => $(el).text()).get(),
            genres: $item.find(SELECTORS.storyList.genres).map((_, el) => ({
                id: this._convertHrefToId($(el).attr("href") || "", 2),
                name: this._getDefaultText($(el).text()),
            })).get(),
            status: $item.find(SELECTORS.storyList.statusIcon).hasClass(SELECTORS.storyList.statusFullClass) ? "Full" : this._getDefaultText(),
            totalChapters: Number($item.find(SELECTORS.storyList.totalChapters).text().match(/(\d+)/)?.[1] || 0),
            // --- Fields below are not available in list view, return default/empty values ---
            isTrending: false,
            shortDescription: this._getDefaultText(),
            lastestChapters: [],
            otherNames: [],
            totalViews: this._getDefaultText(),
            totalComments: this._getDefaultText(),
            followers: this._getDefaultText(),
            updatedAt: this._getDefaultText(),
        };
    }

    private _getBookId($: CheerioAPI): string | null {
        const scripts = $(SELECTORS.scripts).map((_, el) => $(el).html() || '').get().join('\n');
        const ridMatch = scripts.match(/var\s+rid\s*=\s*['"](\d+)['"]/i);
        if (ridMatch) return ridMatch[1];

        const onclickStr = $(SELECTORS.pagingLinks).attr('onclick') || '';
        const onclickMatch = onclickStr.match(/page\(\s*['"]?(\d+)['"]?\s*,/);
        if (onclickMatch) return onclickMatch[1];

        const inputBid = $(SELECTORS.bookIdInput).val();
        if (inputBid && /^\d+$/.test(inputBid as string)) return inputBid as string;

        return null;
    }

    private _getTotalChapterPages($: CheerioAPI): number {
        const lastPageLink = $(SELECTORS.lastPageLink);
        if (lastPageLink.length > 0) {
            const onclick = lastPageLink.attr("onclick") || "";
            const match = onclick.match(/page\(\d+,\s*(\d+)\)/);
            if (match) return Number(match[1]);
        }

        const pageNumbers = $(SELECTORS.pagingLinks)
            .map((_, el) => {
                const text = $(el).text().trim();
                const onclick = $(el).attr("onclick") || "";
                return Number(text.match(/\d+/)?.[0] || onclick.match(/page\(\d+,\s*(\d+)\)/)?.[1] || 0);
            })
            .get()
            .filter(n => n > 1);

        return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
    }

    // --- PUBLIC API METHODS ---

    private async getStories(path: string, page: number = 1, isSearchPath = false): Promise<any> {
        const fullPath = isSearchPath ? path : `${path}${page > 1 ? `?page=${page}` : ''}`;
        const $ = await this.createRequest(fullPath) as CheerioAPI;

        const pageLinks = $(SELECTORS.storyList.paginationLinks);
        const maxPage = pageLinks.map((_, el) => {
            const href = $(el).attr("href") || "";
            const text = $(el).text().trim();
            return Number(href.match(/\?page=(\d+)/)?.[1] || text.match(/\d+/)?.[0] || 0);
        }).get().filter(n => n > 0);

        const totalPages = maxPage.length > 0 ? Math.max(...maxPage) : 1;
        if (page > totalPages) {
            return { status: 404, message: "Page not found" };
        }

        const comics = $(SELECTORS.storyList.item).map((i, el) => this._parseStoryItemFromList($, el)).get();

        return {
            comics,
            totalPages,
            currentPage: page,
            hasMorePages: totalPages > page || $(SELECTORS.storyList.paginationNext).length > 0
        };
    }

    public async getChapters(parameters: { slug: string, bookId?: string | null, chapterPage?: number }): Promise<any[]> {
        let { bookId, chapterPage = 1 } = parameters;
        try {
            if (!bookId) {
                const $ = await this.createRequest(`${parameters.slug}/`);
                bookId = this._getBookId($);
                if (!bookId) throw new Error(`Could not find bookId for slug: ${parameters.slug}`);
            }

            const url = `get/listchap/${bookId}?page=${chapterPage}`;
            const response = await this.createRequest(url, true);

            let htmlFragment: string = (typeof response === 'string' ? JSON.parse(response).data : response.data) || "";
            htmlFragment = htmlFragment.replace(/\\u([\dA-Fa-f]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)))
                .replace(/\\/g, '');

            const $chapters = load(htmlFragment);
            return $chapters(SELECTORS.chapterList.item).map((_, el) => {
                const $el = $chapters(el);
                const href = $el.attr('href') || '';
                const title = $el.text().trim();
                const chapterMatch = href.match(/chuong-(\d+)/i) || title.match(/Chương\s*(\d+)/i);
                return {
                    id: href.split('/').pop() || '',
                    name: title,
                    chapterNumber: chapterMatch ? parseInt(chapterMatch[1], 10) : 0,
                    url: `${this.domain}/${href}`,
                    updatedAt: new Date().toISOString(),
                };
            }).get();
        } catch (err) {
            console.error("Error fetching chapters:", err);
            return [];
        }
    }

    public async getGenres(): Promise<any> {
        const $ = await this.createRequest("") as CheerioAPI;
        return $(SELECTORS.genreList).closest('.menu-item-has-children').find(SELECTORS.genreListItem).map((_, item) => {
            const el = $(item);
            const href = el.attr("href") ?? "";
            return {
                id: this._convertHrefToId(href, 2),
                name: this._getDefaultText(el.text()),
                description: el.attr("title"),
                url: href
            };
        }).get() || [];
    }

    public async getRecommendStory(): Promise<any> {
        return this.getStories("danh-sach/truyen-hot");
    }

    public async getRecentUpdateStory(): Promise<any> {
        try {
            const $ = await this.createRequest("") as CheerioAPI;
            const comics = $(SELECTORS.recentUpdate.item).map((_, element) => {
                const $item = $(element);
                const titleLink = $item.find(SELECTORS.recentUpdate.titleLink);
                const href = titleLink.attr('href')?.replace(/^\//, '') || '';
                const chapterLink = $item.find(SELECTORS.recentUpdate.chapterLink);

                return {
                    id: href.split('/').filter(Boolean)[0] || href,
                    title: titleLink.text().trim().replace(/^\s*›\s*/, '').trim(),
                    href: href,
                    genres: $item.find(SELECTORS.recentUpdate.genres).map((_, el) => ({
                        id: $(el).attr('href')?.replace('/the-loai/', '') || '',
                        name: $(el).text().trim(),
                    })).get(),
                    status: $item.find(SELECTORS.recentUpdate.statusFull).length > 0 ? 'Full' : 'Đang cập nhật',
                    isNew: $item.find(SELECTORS.recentUpdate.statusNew).length > 0,
                    totalChapters: parseInt(chapterLink.text().match(/(\d+)\s*chương/i)?.[1] || '0', 10),
                    latestChapter: {
                        name: chapterLink.text().trim(),
                        href: chapterLink.attr('href') || '',
                        id: chapterLink.attr('href')?.split('/').pop() || '',
                    },
                    updatedAt: $item.find(SELECTORS.recentUpdate.updatedAt).text().trim(),
                    // --- Default fields to match response structure ---
                    thumbnail: '', fullThumbnail: '', authors: [], otherNames: [], shortDescription: '',
                    totalViews: 0, followers: 0, totalComments: 0, isTrending: false, isHot: false,
                    isCompleted: $item.find(SELECTORS.recentUpdate.statusFull).length > 0,
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

    public async getCompletedStory(page: number = 1): Promise<any> {
        return this.getStories("/danh-sach/truyen-full", page);
    }

    public async getStoryByGenre(genreId: string, page: number = 1): Promise<any> {
        const path = `/the-loai/${genreId}`;
        return this.getStories(path, page);
    }

    public async getTrendingStory(page: number = 1): Promise<any> {
        return this.getStories("danh-sach/truyen-hot?page=2", page);
    }

    public async searchStory(query: string, page: number = 1): Promise<any> {
        return this.getStories(`tim-kiem?s=${query.replace(/\s+/g, "+")}&page=${page}`, page, true);
    }

    public async getStoryDetail(parameters: { slug: string, chapterPage?: number }): Promise<any> {
        try {
            const $ = await this.createRequest(`${parameters.slug}/`) as CheerioAPI;
            const bookId = this._getBookId($);

            const [chapters] = await Promise.all<any>([
                this.getChapters({ ...parameters, bookId }),
            ]);

            const thumbnailSrc = $(SELECTORS.storyDetail.thumbnail).attr("src") || $(SELECTORS.storyDetail.ogImage).attr("content") || $(SELECTORS.storyDetail.booksImage).attr("src") || '';
            const viewText = $(SELECTORS.storyDetail.totalViews).text();

            return {
                title: $(SELECTORS.storyDetail.title).text() || $(SELECTORS.storyDetail.altTitle).text(),
                thumbnail: thumbnailSrc.startsWith("http") ? thumbnailSrc : this.domain + thumbnailSrc,
                description: this._convertText($(SELECTORS.storyDetail.description)),
                authors: $(SELECTORS.storyDetail.authors).map((_, el) => $(el).text()).get(),
                status: this._getDefaultText($(SELECTORS.storyDetail.status).text().trim()),
                genres: $(SELECTORS.storyDetail.genres).map((_, el) => ({
                    id: this._convertHrefToId($(el).attr("href") || "", 2),
                    name: $(el).text(),
                })).get(),
                totalViews: viewText.match(/[\d,]+/)?.[0].replace(/,/g, "") || this._getDefaultText(),
                average: this._getDefaultText($(SELECTORS.storyDetail.averageRating).text().match(/\d+\.?\d*/)?.[0]),
                ratingCount: this._getDefaultText($(SELECTORS.storyDetail.ratingCount).attr("data-score")),
                totalChapters: Number($(SELECTORS.storyDetail.totalChapters).text().match(/Số chương\D*(\d+)/i)?.[1] || 0),
                totalChapterPages: this._getTotalChapterPages($),
                chapters,
                id: parameters.slug,
                // --- Default fields to match response structure ---
                followers: this._getDefaultText(),
                isAdult: false,
                otherNames: [],
                translators: [],
            };
        } catch (err) {
            console.error("Error crawling comic detail:", err);
            throw err;
        }
    }

    public async getChapterContent(parameters: { slug: string, id: string }): Promise<any> {
        try {
            const $ = await this.createRequest(`${parameters.slug}/${parameters.id}/`) as CheerioAPI;
            const pageTitle = $(SELECTORS.chapterContent.pageTitle).text() ?? '';
            const titleParts = pageTitle.split(' - ');

            let comicName, chapterName;
            if (titleParts.length > 1) {
                comicName = titleParts[0].replace(/ \(Full\)$/i, "");
                chapterName = titleParts[1];
            } else {
                chapterName = $(SELECTORS.chapterContent.chapterName).text();
                comicName = $(SELECTORS.chapterContent.comicName).text() || $(SELECTORS.chapterContent.recentlyViewedScript).text().match(/"title":"([^"]+)"/)?.[1];
            }

            return {
                comicName,
                chapterName,
                content: this._convertText($(SELECTORS.chapterContent.content)),
                chapterNumber: Number(parameters.id.match(/chuong-(\d+)/i)?.[1] || 0),
                // --- Default fields to match response structure ---
                chapters: [],
            };
        } catch (err) {
            console.error("Error crawling chapter:", err);
            throw err;
        }
    }
}

export const SSStory = new SSStoryApi();
